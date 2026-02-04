import puppeteer from "puppeteer";
import * as dotenv from "dotenv";
import { sendImageToSlack, sendMessageToSlack } from "./slack";
import { pick } from "./pick";
dotenv.config();

const URL_LOGIN = "https://www.dhlottery.co.kr/login";
const URL_GAME = "https://ol.dhlottery.co.kr/olotto/game/game645.do";

const SELECTOR_ID_FOR_LOGIN = "#inpUserId";
const SELECTOR_PASSWORD_FOR_LOGIN = "#inpUserPswdEncn";

const SELECTOR_BUTTON_FOR_WAY_TO_BUY = "#num1";

const SELECTOR_BUTTON_LOTTO_NUMBER = Array.from(
  Array(46),
  (_, i) => `label[for=check645num${i}]`,
);
const SELECTOR_SELECT_FOR_AMOUNT = "select#amoundApply";
const SELECTOR_BUTTON_FOR_AMOUNT = "input#btnSelectNum";
const SELECTOR_BUTTON_FOR_BUY = "#btnBuy";

const SELECTOR_BUTTONS_DIV = "#popupLayerConfirm > div.box > div.btns";
const SELECTOR_BUTTONS_FOR_CONFIRM =
  "#popupLayerConfirm > div.box > div.btns > input";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36";

const ENV_USER_ID = process.env.DH_LOTTERY_USER_ID;
const ENV_USER_PW = process.env.DH_LOTTERY_PASSWORD;

const ENV_AMOUNT = process.env.AMOUNT_PER_DAY || "1";

const getDay = () =>
  ["일", "월", "화", "수", "목", "금", "토"][new Date().getDay()] + "요일";

const lotto = async () => {
  console.log("\n🎱 === 오 늘 의 로 또 ===\n");
  console.log(`👤 계정: ${ENV_USER_ID}`);
  if (ENV_USER_ID === undefined || ENV_USER_PW === undefined) {
    throw new Error(
      `DH_LOTTERY_USER_ID, DH_LOTTERY_PASSWORD must be defined in .env file`,
    );
  }

  if (ENV_USER_ID.length == 0 || ENV_USER_PW.length == 0) {
    throw new Error(
      `DH_LOTTERY_USER_ID, DH_LOTTERY_PASSWORD must be defined in .env file`,
    );
  }

  const USER_ID = ENV_USER_ID;
  const USER_PW = ENV_USER_PW;
  const AMOUNT = ENV_AMOUNT;

  const isDevMode = process.env.DEV_MODE === "true";
  const browser = await puppeteer.launch({
    headless: !isDevMode,
    args: isDevMode
      ? [] // 개발 모드에서는 기본 args 사용
      : [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
        ],
  });

  const page = await browser.newPage();

  await page.setUserAgent(USER_AGENT);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "platform", {
      get: function () {
        return "MacIntel";
      },
      set: function (a) {},
    });
  });

  console.log("🔐 [로그인]");
  console.log("  🌐 로그인 페이지 접속 중...");

  try {
    const response = await page.goto(URL_LOGIN, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    if (!response) {
      throw new Error("페이지 응답이 없습니다.");
    }

    await page.setViewport({ width: 1080, height: 1024 });
    await page.waitForSelector(SELECTOR_ID_FOR_LOGIN, { timeout: 10000 });
  } catch (error) {
    console.error("  ❌ 로그인 페이지 접속 실패:", error);
    await browser.close();
    throw error;
  }

  console.log("  ✏️  ID/비밀번호 입력 중...");

  try {
    const idField = await page.$(SELECTOR_ID_FOR_LOGIN);
    const pwField = await page.$(SELECTOR_PASSWORD_FOR_LOGIN);

    if (!idField || !pwField) {
      throw new Error("로그인 입력 필드를 찾을 수 없습니다.");
    }

    await page.type(SELECTOR_ID_FOR_LOGIN, USER_ID);
    await page.type(SELECTOR_PASSWORD_FOR_LOGIN, USER_PW);

    await page.keyboard.press("Enter");
  } catch (error) {
    console.error("  ❌ 로그인 정보 입력 실패:", error);
    throw error;
  }

  try {
    await page.waitForNavigation({ timeout: 10000, waitUntil: "networkidle2" });
    console.log("  ✅ 로그인 완료\n");
  } catch (error) {
    console.error("  ❌ 로그인 실패:", error);
    throw error;
  }

  console.log("🎮 [게임]");
  console.log("  📄 게임 페이지 이동 중...");

  try {
    const gameResponse = await page.goto(URL_GAME, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    if (!gameResponse) {
      throw new Error("게임 페이지 응답이 없습니다.");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    await page.waitForSelector(SELECTOR_BUTTON_FOR_WAY_TO_BUY, {
      timeout: 10000,
      visible: true,
    });

    const button = await page.$(SELECTOR_BUTTON_FOR_WAY_TO_BUY);
    if (!button) {
      throw new Error(
        `버튼을 찾을 수 없습니다: ${SELECTOR_BUTTON_FOR_WAY_TO_BUY}`,
      );
    }

    await page.click(SELECTOR_BUTTON_FOR_WAY_TO_BUY);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error("  ❌ 게임 페이지 실패:", error);
    throw error;
  }

  console.log(`  🎫 번호 선택 및 구매 요청 (${AMOUNT}게임)`);

  for (var i = 0; i < parseInt(AMOUNT); i++) {
    const numbers = pick();

    for (const n of numbers) {
      await page.click(SELECTOR_BUTTON_LOTTO_NUMBER[n]);
    }

    await page.select(SELECTOR_SELECT_FOR_AMOUNT, AMOUNT);
    await page.click(SELECTOR_BUTTON_FOR_AMOUNT);
  }

  await page.waitForSelector(SELECTOR_BUTTON_FOR_BUY);
  await page.click(SELECTOR_BUTTON_FOR_BUY);

  console.log("  ✔️  구매 확인 버튼 클릭...");
  await page.waitForSelector(SELECTOR_BUTTONS_DIV);
  await page.click(SELECTOR_BUTTONS_FOR_CONFIRM);

  // 확인 버튼 클릭 후 잠시 대기
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const pageState = await page.evaluate(() => {
    const popReceipt = document.querySelector("#popReceipt");
    return {
      popReceiptExists: !!popReceipt,
      popReceiptVisible: popReceipt
        ? window.getComputedStyle(popReceipt).display !== "none"
        : false,
    };
  });

  try {
    // 구매한도 알림(일주일 5천원 한도 초과) 다이얼로그 감지
    const isLimitExceeded = await page.evaluate(() => {
      const h2 = Array.from(document.querySelectorAll("h2")).find(
        (el) => el.textContent?.trim() === "구매한도 알림",
      );
      if (!h2) return false;
      const box = h2.closest(".box");
      return box ? window.getComputedStyle(box).display !== "none" : false;
    });
    if (isLimitExceeded) {
      console.log(
        "\n⚠️  [한도 초과] 이번 주 구매한도(5천원)를 모두 사용하셨습니다.",
      );
      console.log("     다음 회차 판매개시 후 구매 가능합니다.\n");
      throw new Error("이번 주 로또 구매한도(5천원)를 모두 사용하셨습니다.");
    }

    let result = null;
    if (pageState.popReceiptExists && pageState.popReceiptVisible) {
      result = await page.$("#popReceipt");
      if (!result) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        result = await page.$("#popReceipt");
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      await page.waitForSelector("#popReceipt", {
        visible: true,
        timeout: 15000, // 타임아웃을 15초로 증가
      });

      result = await page.$("#popReceipt");
    }

    if (!result) {
      throw new Error("#popReceipt 요소를 찾을 수 없습니다.");
    }

    await page.evaluate(() => {
      document.querySelector("div.n720PlusBanner")?.remove();
      document.querySelector("#popReceipt h2")?.remove();
      document.querySelector("input#closeLayer")?.remove();
      document.querySelector("div.explain")?.remove();
    });

    // 요소를 다시 가져와서 최신 상태 확인
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 요소 제거 후 안정화 대기
    result = await page.$("#popReceipt");

    if (result) {
      console.log("\n📤 [결과]");
      console.log("  📸 영수증 스크린샷 촬영 중...");

      // 요소가 실제로 보이는지 확인
      const elementInfo = await page.evaluate(() => {
        const el = document.querySelector("#popReceipt");
        if (!el) return { exists: false, visible: false, rect: null };
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0;
        return {
          exists: true,
          visible,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      });

      let b64string: string;

      if (elementInfo.exists && elementInfo.visible && elementInfo.rect) {
        // 요소가 보이면 요소만 스크린샷 시도
        try {
          b64string = (await result.screenshot({
            encoding: "base64",
          })) as string;
        } catch {
          try {
            b64string = (await page.screenshot({
              encoding: "base64",
              clip: elementInfo.rect,
            })) as string;
          } catch {
            b64string = (await page.screenshot({
              encoding: "base64",
            })) as string;
          }
        }
      } else {
        b64string = (await page.screenshot({
          encoding: "base64",
        })) as string;
      }

      //슬랙을 사용하려면 해당 주석을 풀고, .env 파일에 SLACK_BOT_TOKEN을 추가해야 합니다.

      await sendImageToSlack({
        base64fromImage: b64string,
        message: `설레는 ${getDay()}! 오늘의 로또가 발급됐읍니다. (https://dhlottery.co.kr/myPage.do?method=lottoBuyListView)`,
      });

      console.log("  📲 슬랙 전송 완료");
      console.log("  ✅ 오늘의 로또 발급 완료!\n");
    }
  } catch (error) {
    const isLimitExceeded =
      error instanceof Error &&
      error.message.includes("구매한도(5천원)를 모두 사용");

    await sendMessageToSlack({
      message: isLimitExceeded
        ? "이번 주 로또 구매한도(5천원)를 모두 사용하셨습니다. 다음 회차 판매개시 후 구매 가능합니다."
        : "이번주 로또 구매는 실패했습니다.....",
    });
    console.log("\n📤 [결과]");
    console.error("  ❌ 실패:", error instanceof Error ? error.message : error);
    console.log("");
  }

  await browser.close();
};
lotto();
