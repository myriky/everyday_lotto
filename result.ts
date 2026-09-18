import puppeteer, { type Page } from "puppeteer";
import * as dotenv from "dotenv";
import { sendImageToSlack, sendMessageToSlack } from "./slack";
import { login } from "./login";
dotenv.config();

const URL_RESULT = "https://www.dhlottery.co.kr/lt645/result";
const URL_LEDGER = "https://www.dhlottery.co.kr/mypage/mylotteryledger";

// 추첨결과 페이지: 활성 슬라이드가 최신 회차
const SELECTOR_RESULT_SLIDE = "#swiperDiv .swiper-slide-active";
const SELECTOR_RESULT_ROUND = ".ltEpsd";
const SELECTOR_RESULT_DATE = ".result-date";
const SELECTOR_RESULT_BALL = ".result-ballBox .result-ball";

// 구매/당첨 내역 페이지 (기본 조회기간: 최근 1주일)
const SELECTOR_LEDGER_LIST = "#winning-history-list";
const SELECTOR_LEDGER_ROW = "#winning-history-list ul.whl-body li.whl-row";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36";

const ENV_USER_ID = process.env.DH_LOTTERY_USER_ID;
const ENV_USER_PW = process.env.DH_LOTTERY_PASSWORD;

// 추첨 직후 "추첨중" 상태가 남아 있으면 이 간격으로 재조회, 최대 대기 시간까지
const RETRY_INTERVAL_MINUTES = 10;
const MAX_WAIT_MINUTES = Number(process.env.RESULT_MAX_WAIT_MINUTES ?? "60");

type WinningResult = {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
};

type LedgerRow = {
  buyDate: string;
  name: string;
  round: number;
  barcode: string;
  count: number;
  result: string; // 미추첨 | 추첨중 | 당첨 | 낙첨 ...
  resultClass: string; // win | lose ...
  amount: string;
  drawDate: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;

const parseWon = (s: string) =>
  Number((s.match(/[\d,]+/)?.[0] ?? "0").replace(/,/g, ""));

const isPending = (row: LedgerRow) => /추첨중|미추첨/.test(row.result);

const fetchWinningResult = async (
  page: Page,
): Promise<WinningResult> => {
  console.log("🎯 [추첨결과]");
  console.log("  📄 추첨결과 페이지 조회 중...");

  await page.goto(URL_RESULT, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector(`${SELECTOR_RESULT_SLIDE} ${SELECTOR_RESULT_BALL}`, {
    timeout: 15000,
  });

  const raw = await page.evaluate(
    (slideSel: string, roundSel: string, dateSel: string, ballSel: string) => {
      const slide = document.querySelector(slideSel);
      if (!slide) return null;
      return {
        round: slide.querySelector(roundSel)?.textContent?.trim() ?? "",
        date: slide.querySelector(dateSel)?.textContent?.trim() ?? "",
        balls: Array.from(slide.querySelectorAll(ballSel)).map((el) =>
          (el.textContent ?? "").trim(),
        ),
      };
    },
    SELECTOR_RESULT_SLIDE,
    SELECTOR_RESULT_ROUND,
    SELECTOR_RESULT_DATE,
    SELECTOR_RESULT_BALL,
  );

  if (!raw || raw.balls.length !== 7 || !/^\d+$/.test(raw.round)) {
    throw new Error(
      `추첨결과 파싱 실패: ${JSON.stringify(raw)} (페이지 구조 변경 가능성)`,
    );
  }

  const nums = raw.balls.map(Number);
  const result: WinningResult = {
    round: Number(raw.round),
    date: raw.date.replace(/\s*추첨$/, ""),
    numbers: nums.slice(0, 6),
    bonus: nums[6],
  };
  console.log(
    `  ✅ 제${result.round}회 (${result.date}) ${result.numbers.join(" ")} + ${result.bonus}\n`,
  );
  return result;
};

const fetchLedgerRows = async (page: Page): Promise<LedgerRow[]> => {
  await page.goto(URL_LEDGER, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector(SELECTOR_LEDGER_LIST, { timeout: 15000 });
  // 목록은 AJAX로 채워지므로 잠시 대기
  await sleep(2000);

  const rows = await page.evaluate((rowSel: string) => {
    const text = (el: Element | null, sel: string) =>
      (el?.querySelector(sel)?.textContent ?? "").replace(/\s+/g, " ").trim();
    return Array.from(document.querySelectorAll(rowSel)).map((row) => ({
      buyDate: text(row, ".col-date1 .whl-txt"),
      name: text(row, ".col-name .whl-txt"),
      round: Number(text(row, ".col-th .whl-txt")),
      barcode: text(row, ".col-num .whl-txt"),
      count: Number(text(row, ".col-ea .whl-txt")) || 0,
      result: text(row, ".col-result .whl-txt"),
      resultClass: (row.querySelector(".col-result")?.className ?? "")
        .replace(/whl-col|col-result/g, "")
        .trim(),
      amount: text(row, ".col-am .whl-txt"),
      drawDate: text(row, ".col-date2 .whl-txt"),
    }));
  }, SELECTOR_LEDGER_ROW);

  return rows.filter((r) => r.name.includes("로또6/45"));
};

const buildMessage = (
  win: WinningResult,
  rows: LedgerRow[],
  stillPending: boolean,
) => {
  const lines: string[] = [];
  lines.push(`🎱 제${win.round}회 로또 6/45 추첨 결과 (${win.date})`);
  lines.push(
    `당첨번호: ${win.numbers.join(" ")}  +  보너스 ${win.bonus}`,
  );
  lines.push("");

  const thisRound = rows.filter((r) => r.round === win.round);
  if (thisRound.length === 0) {
    lines.push("이번 회차에 구매한 로또가 없습니다.");
  } else {
    const totalCount = thisRound.reduce((a, r) => a + r.count, 0);
    lines.push(`이번 주 구매 내역 (${totalCount}게임):`);
    let totalWon = 0;
    let winCount = 0;
    for (const r of thisRound) {
      const won = parseWon(r.amount);
      const isWin = /win/.test(r.resultClass) || /^당첨/.test(r.result);
      if (isWin) {
        winCount += r.count;
        totalWon += won;
      }
      const mark = isWin ? "🎉" : isPending(r) ? "⏳" : "❌";
      const amountText = isWin ? ` ${formatWon(won)}` : "";
      lines.push(`${mark} ${r.buyDate} - ${r.result}${amountText}`);
    }
    lines.push("");
    if (stillPending) {
      lines.push("⏳ 아직 결과 반영 중인 게임이 있습니다. 내역 페이지에서 다시 확인해 주세요.");
    } else if (winCount > 0) {
      lines.push(`🎉 축하합니다! ${winCount}게임 당첨, 총 ${formatWon(totalWon)}`);
    } else {
      lines.push("아쉽지만 이번 주는 당첨이 없습니다. 다음 주를 기대해요!");
    }
  }
  lines.push("");
  lines.push(`구매/당첨 내역: ${URL_LEDGER}`);
  return lines.join("\n");
};

const result = async () => {
  console.log("\n🎱 === 이 번 주 로 또 결 과 ===\n");

  if (!ENV_USER_ID || !ENV_USER_PW) {
    throw new Error(
      `DH_LOTTERY_USER_ID, DH_LOTTERY_PASSWORD must be defined in .env file`,
    );
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1080, height: 1024 });
  page.on("dialog", async (dialog) => {
    console.log(`  ⚠️  다이얼로그: ${dialog.message()}`);
    await dialog.dismiss().catch(() => {});
  });

  try {
    const win = await fetchWinningResult(page);

    await login(page, ENV_USER_ID, ENV_USER_PW);

    console.log("📒 [구매/당첨 내역]");
    let rows: LedgerRow[] = [];
    let waited = 0;
    while (true) {
      console.log("  📄 내역 조회 중...");
      rows = await fetchLedgerRows(page);
      const thisRound = rows.filter((r) => r.round === win.round);
      const pending = thisRound.filter(isPending);
      console.log(
        `  📋 로또 ${rows.length}건 중 제${win.round}회 ${thisRound.length}건, 반영 대기 ${pending.length}건`,
      );
      if (pending.length === 0 || waited >= MAX_WAIT_MINUTES) break;
      console.log(
        `  ⏳ 결과 반영 대기... ${RETRY_INTERVAL_MINUTES}분 후 재조회 (누적 ${waited}/${MAX_WAIT_MINUTES}분)`,
      );
      await sleep(RETRY_INTERVAL_MINUTES * 60 * 1000);
      waited += RETRY_INTERVAL_MINUTES;
    }

    const stillPending = rows.some((r) => r.round === win.round && isPending(r));
    const message = buildMessage(win, rows, stillPending);
    console.log("\n📤 [결과]");
    console.log(message.split("\n").map((l) => `  ${l}`).join("\n"));

    console.log("\n  📸 내역 스크린샷 촬영 중...");
    const listEl = await page.$(SELECTOR_LEDGER_LIST);
    const b64string = (await (listEl ?? page).screenshot({
      encoding: "base64",
    })) as string;

    await sendImageToSlack({
      base64fromImage: b64string,
      filename: "lotto_result.png",
      title: `제${win.round}회 로또 결과`,
      message,
    });
    console.log("  📲 슬랙 전송 완료");
    console.log("  ✅ 이번 주 로또 결과 알림 완료!\n");
  } catch (error) {
    console.error("\n❌ 실패:", error);
    // 실패 원인 파악을 위해 현재 화면을 슬랙으로 전송 (전송 실패는 무시)
    try {
      const b64string = (await page.screenshot({ encoding: "base64" })) as string;
      await sendImageToSlack({
        base64fromImage: b64string,
        filename: "lotto_result_error.png",
        title: "로또 결과 조회 실패",
        message: `❌ 로또 결과 조회 실패: ${
          error instanceof Error ? error.message : String(error)
        }\n(URL: ${page.url()})`,
      });
    } catch (slackError) {
      console.error("  ⚠️  실패 알림 전송 실패:", slackError);
      await sendMessageToSlack({
        message: `❌ 로또 결과 조회 실패: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }).catch(() => {});
    }
    throw error;
  } finally {
    await browser.close();
  }
};

result().catch(() => process.exit(1));
