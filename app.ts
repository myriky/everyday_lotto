import puppeteer from "puppeteer";
import * as dotenv from "dotenv";
import { sendImageToSlack, sendMessageToSlack } from "./slack";
import { pick } from "./pick";
dotenv.config();

const URL_LOGIN = "https://www.dhlottery.co.kr/login";
const URL_GAME = "https://ol.dhlottery.co.kr/olotto/game/game645.do";

const SELECTOR_ID_FOR_LOGIN = "#inpUserId";
const SELECTOR_PASSWORD_FOR_LOGIN = "#inpUserPswdEncn";

const SELECTOR_BUTTON_FOR_PASSWORD_LATER = "#btnCancel";

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
  } catch (error) {
    console.error("  ❌ 로그인 실패:", error);
    throw error;
  }

  // 장기간 비밀번호 미변경 시 안내 페이지(/mbrsrvc/ExpryPswdNoti)로 리다이렉트됨.
  // "다음에 변경"을 눌러야 세션이 완성되며, 30일 연장은 쿠키 기반이라 CI에서는 매번 표시됨.
  if (page.url().includes("ExpryPswdNoti")) {
    console.log("  🔔 비밀번호 변경 안내 페이지 감지 → '다음에 변경' 클릭");
    try {
      await page.waitForSelector(SELECTOR_BUTTON_FOR_PASSWORD_LATER, {
        timeout: 10000,
        visible: true,
      });
      await Promise.all([
        page.waitForNavigation({ timeout: 10000, waitUntil: "networkidle2" }),
        page.click(SELECTOR_BUTTON_FOR_PASSWORD_LATER),
      ]);
    } catch (error) {
      console.error("  ❌ 비밀번호 변경 안내 처리 실패:", error);
      throw error;
    }
  }

  if (page.url().includes("/login") || page.url().includes("ExpryPswdNoti")) {
    throw new Error(`로그인 후 예상치 못한 페이지에 머물러 있습니다: ${page.url()}`);
  }
  console.log("  ✅ 로그인 완료\n");

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

  try {
    // #report(영수증 래퍼)와 구매한도 알림은 마크업에 항상 존재하며 display:none 토글로 제어됨
    // 구매 성공 후 한도를 모두 채운 경우, 영수증과 한도 알림이 동시에 보일 수 있음
    // → 영수증이 보이면 구매 성공으로 우선 처리

    const popupState = await page.evaluate(() => {
      // 영수증 팝업 (#report > #popReceipt)
      const report = document.querySelector("#report");
      const receiptVisible = report
        ? window.getComputedStyle(report).display !== "none"
        : false;

      // 구매한도 알림 다이얼로그 (#recommend720Plus > .box > .head > h2)
      // display:none은 최상위 #recommend720Plus에 적용되므로 이 요소를 직접 체크
      const limitContainer = document.querySelector("#recommend720Plus");
      const limitVisible = limitContainer
        ? window.getComputedStyle(limitContainer).display !== "none"
        : false;

      return { receiptVisible, limitVisible };
    });

    // ── 케이스 1: 영수증이 보임 → 구매 성공 ──
    if (popupState.receiptVisible) {
      let result = await page.$("#popReceipt");

      if (!result) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        result = await page.$("#popReceipt");
      }

      if (!result) {
        throw new Error("#popReceipt 요소를 찾을 수 없습니다.");
      }

      // 스크린샷에 불필요한 요소 제거
      await page.evaluate(() => {
        document.querySelector("div.n720PlusBanner")?.remove();
        document.querySelector("#popReceipt h2")?.remove();
        document.querySelector("input#closeLayer")?.remove();
        document.querySelector("div.explain")?.remove();
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await page.$("#popReceipt");

      if (result) {
        console.log("\n📤 [결과]");
        console.log("  📸 영수증 스크린샷 촬영 중...");

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

        await sendImageToSlack({
          base64fromImage: b64string,
          message: `설레는 ${getDay()}! 오늘의 로또가 발급됐읍니다. (https://dhlottery.co.kr/myPage.do?method=lottoBuyListView)`,
        });

        console.log("  📲 슬랙 전송 완료");
        console.log("  ✅ 오늘의 로또 발급 완료!");
      }

      // 구매는 성공했지만 한도를 모두 채운 경우 안내
      if (popupState.limitVisible) {
        console.log(
          "\n⚠️  [한도 안내] 이번 주 구매한도(5천원)를 모두 사용하셨습니다.",
        );
        console.log("     다음 회차 판매개시 후 구매 가능합니다.\n");
      }

    // ── 케이스 2: 영수증 없음 + 한도 알림만 보임 → 구매 실패 (한도 초과) ──
    } else if (popupState.limitVisible) {
      console.log(
        "\n⚠️  [한도 초과] 이번 주 구매한도(5천원)를 모두 사용하셨습니다.",
      );
      console.log("     다음 회차 판매개시 후 구매 가능합니다.\n");
      throw new Error("이번 주 로또 구매한도(5천원)를 모두 사용하셨습니다.");

    // ── 케이스 3: 아직 아무것도 안 보임 → 영수증 대기 ──
    } else {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      await page.waitForSelector("#report", {
        visible: true,
        timeout: 15000,
      });

      let result = await page.$("#popReceipt");
      if (!result) {
        throw new Error("#popReceipt 요소를 찾을 수 없습니다.");
      }

      await page.evaluate(() => {
        document.querySelector("div.n720PlusBanner")?.remove();
        document.querySelector("#popReceipt h2")?.remove();
        document.querySelector("input#closeLayer")?.remove();
        document.querySelector("div.explain")?.remove();
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await page.$("#popReceipt");

      if (result) {
        console.log("\n📤 [결과]");
        console.log("  📸 영수증 스크린샷 촬영 중...");

        let b64string: string;
        try {
          b64string = (await result.screenshot({
            encoding: "base64",
          })) as string;
        } catch {
          b64string = (await page.screenshot({
            encoding: "base64",
          })) as string;
        }

        await sendImageToSlack({
          base64fromImage: b64string,
          message: `설레는 ${getDay()}! 오늘의 로또가 발급됐읍니다. (https://dhlottery.co.kr/myPage.do?method=lottoBuyListView)`,
        });

        console.log("  📲 슬랙 전송 완료");
        console.log("  ✅ 오늘의 로또 발급 완료!\n");
      } else {
        throw new Error("#popReceipt 요소를 찾을 수 없습니다.");
      }
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

  if (!isDevMode) {
    await browser.close();
  } else {
    console.log("🛠️  [DEV] 브라우저를 열어둡니다. 수동으로 닫아주세요.");
    // dev 모드에서는 브라우저가 닫힐 때까지 대기
    await new Promise<void>((resolve) => {
      browser.on("disconnected", () => resolve());
    });
  }
};
lotto();
