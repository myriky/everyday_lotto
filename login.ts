import type { Page } from "puppeteer";

export const URL_LOGIN = "https://www.dhlottery.co.kr/login";

const SELECTOR_ID_FOR_LOGIN = "#inpUserId";
const SELECTOR_PASSWORD_FOR_LOGIN = "#inpUserPswdEncn";
const SELECTOR_BUTTON_FOR_PASSWORD_LATER = "#btnCancel";

/**
 * 동행복권 로그인.
 * 장기간 비밀번호 미변경 시 안내 페이지(/mbrsrvc/ExpryPswdNoti)로 리다이렉트되며,
 * "다음에 변경"을 눌러야 세션이 완성된다. (30일 연장은 쿠키 기반이라 CI에서는 매번 표시됨)
 */
export const login = async (page: Page, userId: string, password: string) => {
  console.log("🔐 [로그인]");
  console.log("  🌐 로그인 페이지 접속 중...");

  const response = await page.goto(URL_LOGIN, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  if (!response) {
    throw new Error("로그인 페이지 응답이 없습니다.");
  }
  await page.waitForSelector(SELECTOR_ID_FOR_LOGIN, { timeout: 10000 });

  console.log("  ✏️  ID/비밀번호 입력 중...");
  await page.type(SELECTOR_ID_FOR_LOGIN, userId);
  await page.type(SELECTOR_PASSWORD_FOR_LOGIN, password);
  await page.keyboard.press("Enter");
  await page.waitForNavigation({ timeout: 10000, waitUntil: "networkidle2" });

  if (page.url().includes("ExpryPswdNoti")) {
    console.log("  🔔 비밀번호 변경 안내 페이지 감지 → '다음에 변경' 클릭");
    await page.waitForSelector(SELECTOR_BUTTON_FOR_PASSWORD_LATER, {
      timeout: 10000,
      visible: true,
    });
    await Promise.all([
      page.waitForNavigation({ timeout: 10000, waitUntil: "networkidle2" }),
      page.click(SELECTOR_BUTTON_FOR_PASSWORD_LATER),
    ]);
  }

  if (page.url().includes("/login") || page.url().includes("ExpryPswdNoti")) {
    throw new Error(
      `로그인 후 예상치 못한 페이지에 머물러 있습니다: ${page.url()}`,
    );
  }
  console.log("  ✅ 로그인 완료\n");
};
