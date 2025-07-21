import puppeteer from "puppeteer";
import * as dotenv from "dotenv";
import { sendImageToSlack, sendMessageToSlack } from "./slack";
import { pick } from "./pick";
dotenv.config();

const URL_LOGIN = "https://dhlottery.co.kr/user.do?method=login";
const URL_GAME = "https://ol.dhlottery.co.kr/olotto/game/game645.do";

const SELECTOR_ID_FOR_LOGIN = '[name="userId"]';
const SELECTOR_PASSWORD_FOR_LOGIN = '[name="password"]';

const SELECTOR_BUTTON_FOR_WAY_TO_BUY = "ul#tabWay2Buy > li:nth-child(1) > a";
const SELECTOR_BUTTON_LOTTO_NUMBER = Array.from(
  Array(46),
  (_, i) => `label[for=check645num${i}]`
);
const SELECTOR_SELECT_FOR_AMOUNT = "select#amoundApply";
const SELECTOR_BUTTON_FOR_AMOUNT = "input#btnSelectNum";
const SELECTOR_BUTTON_FOR_BUY = "input#btnBuy";

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

  const browser = await puppeteer.launch({ headless: true });
  // const browser = await puppeteer.launch({ headless: false });

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

  await page.goto(URL_LOGIN);

  await page.setViewport({ width: 1080, height: 1024 });

  await page.waitForSelector(SELECTOR_ID_FOR_LOGIN);

  console.log("[2] prepare login...");

  await page.type(SELECTOR_ID_FOR_LOGIN, USER_ID);
  await page.type(SELECTOR_PASSWORD_FOR_LOGIN, USER_PW);
  await page.keyboard.press("Enter");

  console.log("[3] try login...");

  await page.waitForNavigation();

  console.log("[4] login completed!");

  await page.goto(URL_GAME);

  console.log("[5] waiting for buy a game...");

  await page.waitForSelector(SELECTOR_BUTTON_FOR_BUY);

  await page.click(SELECTOR_BUTTON_FOR_WAY_TO_BUY);

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

  console.log(a);

  await page.waitForSelector(SELECTOR_BUTTONS_DIV);

  console.log("[8] confirming...");

  await page.click(SELECTOR_BUTTONS_FOR_CONFIRM);

  try {
    await page.waitForSelector("#popReceipt", {
      visible: true,
      timeout: 1000,
    });

    await page.evaluate(() => {
      console.log("[9] remove unnecessary elements...");
      document.querySelector("div.n720PlusBanner")?.remove();
      document.querySelector("#popReceipt h2")?.remove();
      document.querySelector("input#closeLayer")?.remove();
      document.querySelector("div.explain")?.remove();
    });

    const result = await page.$("#popReceipt");

    console.log(result);

    if (result) {
      console.log("[10] screenshot...");

      const b64string: string = (await result?.screenshot({
        encoding: "base64",
      })) as string;

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
