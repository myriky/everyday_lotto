import puppeteer from "puppeteer";
import * as dotenv from "dotenv";
import { sendImageToSlack, sendMessageToSlack } from "./slack";
import { pick } from "./pick";
dotenv.config();

const URL_LOGIN = "https://www.dhlottery.co.kr/login";
const URL_GAME = "https://ol.dhlottery.co.kr/olotto/game/game645.do";

const SELECTOR_ID_FOR_LOGIN = '#inpUserId';
const SELECTOR_PASSWORD_FOR_LOGIN = '#inpUserPswdEncn';

const SELECTOR_BUTTON_FOR_WAY_TO_BUY = "#num1";

const SELECTOR_BUTTON_LOTTO_NUMBER = Array.from(
  Array(46),
  (_, i) => `label[for=check645num${i}]`
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
  console.log("=== 오 늘 의 로 또 ===");
  if (ENV_USER_ID === undefined || ENV_USER_PW === undefined) {
    throw new Error(
      `DH_LOTTERY_USER_ID, DH_LOTTERY_PASSWORD must be defined in .env file`
    );
  }

  if (ENV_USER_ID.length == 0 || ENV_USER_PW.length == 0) {
    throw new Error(
      `DH_LOTTERY_USER_ID, DH_LOTTERY_PASSWORD must be defined in .env file`
    );
  }

  const USER_ID = ENV_USER_ID;
  const USER_PW = ENV_USER_PW;
  const AMOUNT = ENV_AMOUNT;

  console.log(`USER_ID => ${USER_ID}`);
  console.log(`USER_PASSWORD => ${USER_PW.replace(/./g, "*")}`);
  console.log(`envionment loaded!`);

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

  if (isDevMode) {
    console.log("[DEV] 브라우저가 헤드리스 모드로 실행됩니다. (headless: false)");
    console.log("[DEV] 디버깅을 위해 브라우저가 열려있습니다.");
    console.log("[DEV] 각 단계에서 스크린샷이 저장됩니다.");
  }

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

  console.log("[1] navigate to DH LOTTERY login page...");
  console.log(`[1-1] URL: ${URL_LOGIN}`);

  try {
    const response = await page.goto(URL_LOGIN, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    if (!response) {
      throw new Error("페이지 응답이 없습니다.");
    }

    console.log(`[1-2] Response status: ${response.status()}`);
    console.log(`[1-3] Final URL: ${page.url()}`);

    if (isDevMode) {
      // 개발 모드에서 스크린샷 저장
      await page.screenshot({ path: "debug-login-page.png" });
      console.log("[DEV] 스크린샷 저장: debug-login-page.png");
    }

    await page.setViewport({ width: 1080, height: 1024 });

    console.log(`[1-4] 로그인 입력 필드 대기 중... (selector: ${SELECTOR_ID_FOR_LOGIN})`);
    await page.waitForSelector(SELECTOR_ID_FOR_LOGIN, { timeout: 10000 });
    console.log("[1-5] 로그인 입력 필드 발견!");
  } catch (error) {
    console.error("[ERROR] 로그인 페이지 접속 실패:");
    console.error(error);
    
    if (isDevMode) {
      // 에러 발생 시 스크린샷 저장
      await page.screenshot({ path: "debug-error.png" });
      console.log("[DEV] 에러 스크린샷 저장: debug-error.png");
      console.log(`[DEV] 현재 페이지 URL: ${page.url()}`);
      console.log(`[DEV] 현재 페이지 제목: ${await page.title()}`);
    }
    
    await browser.close();
    throw error;
  }

  console.log("[2] prepare login...");

  try {
    const idField = await page.$(SELECTOR_ID_FOR_LOGIN);
    const pwField = await page.$(SELECTOR_PASSWORD_FOR_LOGIN);

    if (!idField || !pwField) {
      throw new Error("로그인 입력 필드를 찾을 수 없습니다.");
    }

    console.log("[2-1] 로그인 정보 입력 중...");
    await page.type(SELECTOR_ID_FOR_LOGIN, USER_ID);
    await page.type(SELECTOR_PASSWORD_FOR_LOGIN, USER_PW);
    
    if (isDevMode) {
      await page.screenshot({ path: "debug-before-login.png" });
      console.log("[DEV] 로그인 전 스크린샷 저장: debug-before-login.png");
    }
    
    await page.keyboard.press("Enter");
  } catch (error) {
    console.error("[ERROR] 로그인 정보 입력 실패:");
    console.error(error);
    
    if (isDevMode) {
      await page.screenshot({ path: "debug-login-error.png" });
      console.log("[DEV] 로그인 에러 스크린샷 저장: debug-login-error.png");
    }
    
    throw error;
  }

  console.log("[3] try login...");

  try {
    await page.waitForNavigation({ timeout: 10000, waitUntil: "networkidle2" });
    console.log(`[3-1] 네비게이션 완료. 현재 URL: ${page.url()}`);
    
    if (isDevMode) {
      await page.screenshot({ path: "debug-after-login.png" });
      console.log("[DEV] 로그인 후 스크린샷 저장: debug-after-login.png");
    }
    
    console.log("[4] login completed!");
  } catch (error) {
    console.error("[ERROR] 로그인 실패:");
    console.error(error);
    console.log(`[ERROR] 현재 URL: ${page.url()}`);
    
    if (isDevMode) {
      await page.screenshot({ path: "debug-login-failed.png" });
      console.log("[DEV] 로그인 실패 스크린샷 저장: debug-login-failed.png");
    }
    
    throw error;
  }

  console.log("[5] navigate to game page...");
  console.log(`[5-1] URL: ${URL_GAME}`);

  try {
    const gameResponse = await page.goto(URL_GAME, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    if (!gameResponse) {
      throw new Error("게임 페이지 응답이 없습니다.");
    }

    console.log(`[5-2] Response status: ${gameResponse.status()}`);
    console.log(`[5-3] Final URL: ${page.url()}`);

    if (isDevMode) {
      await page.screenshot({ path: "debug-game-page.png" });
      console.log("[DEV] 게임 페이지 스크린샷 저장: debug-game-page.png");
    }

    // 페이지가 완전히 로드될 때까지 추가 대기
    console.log(`[5-3-0] 페이지 완전 로드 대기 중...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // iframe 확인
    const iframes = await page.$$('iframe');
    console.log(`[5-3-0-1] iframe 개수: ${iframes.length}`);
    if (iframes.length > 0) {
      for (let i = 0; i < iframes.length; i++) {
        const frame = await iframes[i].contentFrame();
        if (frame) {
          console.log(`[5-3-0-2] iframe[${i}] URL: ${frame.url()}`);
          const frameButtons = await frame.$$('button, a, input[type="button"]');
          console.log(`[5-3-0-3] iframe[${i}] 내부 버튼 개수: ${frameButtons.length}`);
        }
      }
    }

    // 페이지의 실제 HTML 구조 확인 (개발 모드)
    if (isDevMode) {
      const pageHTML = await page.evaluate(() => {
        return {
          bodyHTML: document.body.innerHTML.substring(0, 5000), // 처음 5000자만
          scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || 'inline'),
          allIds: Array.from(document.querySelectorAll('[id]')).map(el => el.id).slice(0, 50),
          allClasses: Array.from(document.querySelectorAll('[class]')).map(el => el.className).slice(0, 50),
        };
      });
      console.log(`[5-3-0-4] 페이지 HTML 구조 (일부):`);
      console.log(`  - Scripts: ${pageHTML.scripts.length}개`);
      console.log(`  - IDs: ${pageHTML.allIds.slice(0, 20).join(', ')}`);
      console.log(`  - Classes: ${pageHTML.allClasses.slice(0, 20).join(', ')}`);
    }

    console.log(`[5-4] 버튼 대기 중... (selector: ${SELECTOR_BUTTON_FOR_WAY_TO_BUY})`);
    
    // 셀렉터가 나타날 때까지 대기
    await page.waitForSelector(SELECTOR_BUTTON_FOR_WAY_TO_BUY, {
      timeout: 10000,
      visible: true,
    });
    
    console.log(`[5-5] 버튼 발견! 클릭 시도...`);
    
    // 버튼이 실제로 보이는지 확인
    const button = await page.$(SELECTOR_BUTTON_FOR_WAY_TO_BUY);
    if (!button) {
      throw new Error(`버튼을 찾을 수 없습니다: ${SELECTOR_BUTTON_FOR_WAY_TO_BUY}`);
    }

    const isVisible = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }, SELECTOR_BUTTON_FOR_WAY_TO_BUY);

    console.log(`[5-6] 버튼 가시성: ${isVisible}`);

    if (isDevMode) {
      await page.screenshot({ path: "debug-before-click.png" });
      console.log("[DEV] 클릭 전 스크린샷 저장: debug-before-click.png");
    }

    await page.click(SELECTOR_BUTTON_FOR_WAY_TO_BUY);
    console.log(`[5-7] 버튼 클릭 완료!`);
    
    // 클릭 후 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 1000));
    
  } catch (error) {
    console.error("[ERROR] 게임 페이지 접속 또는 버튼 클릭 실패:");
    console.error(error);
    console.log(`[ERROR] 현재 URL: ${page.url()}`);
    console.log(`[ERROR] 현재 페이지 제목: ${await page.title()}`);
    
    if (isDevMode) {
      await page.screenshot({ path: "debug-game-error.png" });
      console.log("[DEV] 게임 페이지 에러 스크린샷 저장: debug-game-error.png");
      
      // 페이지의 모든 버튼 정보 출력
      const buttons = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'));
        return allButtons.map(btn => ({
          id: btn.id,
          class: btn.className,
          text: btn.textContent?.trim().substring(0, 50),
          selector: btn.id ? `#${btn.id}` : btn.className ? `.${btn.className.split(' ')[0]}` : null
        })).filter(b => b.id || b.class);
      });
      console.log("[DEV] 페이지의 버튼들:", JSON.stringify(buttons, null, 2));
    }
    
    throw error;
  }
  
  // console.log(`[6] 사장님 자동 ${AMOUNT}게임요~~`);
  // await page.select(SELECTOR_SELECT_FOR_AMOUNT, AMOUNT);
  // await page.click(SELECTOR_BUTTON_FOR_AMOUNT);

  console.log(`[6] 사장님 수동 ${AMOUNT}게임요~~`);

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

  console.log("[7] waiting for confirm...");
  const a = await page.$$(SELECTOR_BUTTONS_FOR_CONFIRM);

  await page.waitForSelector(SELECTOR_BUTTONS_DIV);

  console.log("[8] confirming...");

  await page.click(SELECTOR_BUTTONS_FOR_CONFIRM);

  // 확인 버튼 클릭 후 잠시 대기
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 페이지 상태 확인
  console.log("[8-1] 확인 버튼 클릭 후 페이지 상태 확인...");
  const pageState = await page.evaluate(() => {
    // popReceipt 관련 요소들 찾기
    const popReceipt = document.querySelector("#popReceipt");
    const popReceiptById = document.getElementById("popReceipt");
    const allPopups = Array.from(document.querySelectorAll('[id*="pop"], [id*="Pop"], [id*="receipt"], [id*="Receipt"]'));
    const allModals = Array.from(document.querySelectorAll('[class*="popup"], [class*="modal"], [class*="layer"]'));
    
    return {
      currentURL: window.location.href,
      pageTitle: document.title,
      popReceiptExists: !!popReceipt,
      popReceiptByIdExists: !!popReceiptById,
      popReceiptVisible: popReceipt ? window.getComputedStyle(popReceipt).display !== 'none' : false,
      popReceiptHTML: popReceipt ? popReceipt.outerHTML.substring(0, 500) : null,
      allPopupIds: allPopups.map(el => ({ id: el.id, tag: el.tagName, visible: window.getComputedStyle(el).display !== 'none' })),
      allModalClasses: allModals.slice(0, 10).map(el => ({ 
        id: el.id, 
        class: el.className, 
        tag: el.tagName,
        visible: window.getComputedStyle(el).display !== 'none'
      })),
      bodyHTML: document.body.innerHTML.substring(0, 3000), // 처음 3000자
    };
  });

  console.log(`[8-2] 현재 URL: ${pageState.currentURL}`);
  console.log(`[8-3] 페이지 제목: ${pageState.pageTitle}`);
  console.log(`[8-4] #popReceipt 존재 여부: ${pageState.popReceiptExists}`);
  console.log(`[8-5] #popReceipt 보임 여부: ${pageState.popReceiptVisible}`);


  if (isDevMode) {
    await page.screenshot({ path: "debug-after-confirm.png" });
    console.log("[DEV] 확인 버튼 클릭 후 스크린샷 저장: debug-after-confirm.png");
    
    // 페이지 HTML 일부 저장
    console.log(`[8-9] 페이지 HTML (일부):`);
    console.log(pageState.bodyHTML.substring(0, 1000));
  }

  try {
    // 이미 요소가 존재하고 보이는 경우 바로 진행, 아니면 대기
    let result = null;
    if (pageState.popReceiptExists && pageState.popReceiptVisible) {
      console.log(`[8-10] #popReceipt가 이미 존재하고 보입니다. 바로 진행...`);
      result = await page.$("#popReceipt");
      
      if (!result) {
        console.log(`[8-11] 요소를 가져올 수 없습니다. 잠시 대기 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        result = await page.$("#popReceipt");
      }
    } else {
      console.log(`[8-10] #popReceipt를 찾을 수 없습니다. 대기 중...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
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
      console.log("[9] remove unnecessary elements...");
      document.querySelector("div.n720PlusBanner")?.remove();
      document.querySelector("#popReceipt h2")?.remove();
      document.querySelector("input#closeLayer")?.remove();
      document.querySelector("div.explain")?.remove();
    });

    // 요소를 다시 가져와서 최신 상태 확인
    await new Promise(resolve => setTimeout(resolve, 1000)); // 요소 제거 후 안정화 대기
    result = await page.$("#popReceipt");

    if (result) {
      console.log("[10] screenshot...");

      // 요소가 실제로 보이는지 확인
      const elementInfo = await page.evaluate(() => {
        const el = document.querySelector("#popReceipt");
        if (!el) return { exists: false, visible: false, rect: null };
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const visible = (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0
        );
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

      console.log(`[10-1] 요소 정보:`, elementInfo);

      let b64string: string;
      
      if (elementInfo.exists && elementInfo.visible && elementInfo.rect) {
        // 요소가 보이면 요소만 스크린샷 시도
        try {
          b64string = (await result.screenshot({
            encoding: "base64",
          })) as string;
          console.log(`[10-2] 요소 스크린샷 성공`);
        } catch (error) {
          console.log(`[10-2] 요소 스크린샷 실패, 영역 스크린샷 시도: ${error}`);
          // 요소 스크린샷 실패 시 해당 영역만 스크린샷
          try {
            b64string = (await page.screenshot({
              encoding: "base64",
              clip: elementInfo.rect,
            })) as string;
            console.log(`[10-3] 영역 스크린샷 성공`);
          } catch (clipError) {
            console.log(`[10-3] 영역 스크린샷 실패, 페이지 전체 스크린샷 시도: ${clipError}`);
            // 영역 스크린샷도 실패하면 페이지 전체
            b64string = (await page.screenshot({
              encoding: "base64",
            })) as string;
          }
        }
      } else {
        console.log(`[10-2] 요소가 보이지 않음, 페이지 전체 스크린샷 시도`);
        // 요소가 보이지 않으면 페이지 전체 스크린샷
        b64string = (await page.screenshot({
          encoding: "base64",
        })) as string;
      }

      //슬랙을 사용하려면 해당 주석을 풀고, .env 파일에 SLACK_BOT_TOKEN을 추가해야 합니다.

      await sendImageToSlack({
        base64fromImage: b64string,
        message: `설레는 ${getDay()}! 오늘의 로또가 발급됐읍니다. (https://dhlottery.co.kr/myPage.do?method=lottoBuyListView)`,
      });

      console.log("[11] job completed!");
    }
  } catch (error) {
    //슬랙을 사용하려면 해당 주석을 풀고, .env 파일에 SLACK_BOT_TOKEN을 추가해야 합니다.

    await sendMessageToSlack({
      message: "이번주 로또 구매는 실패했습니다.....",
    });
    console.error("[-] job failed!");
    console.error(error);
  }

  await browser.close();
};
lotto();
