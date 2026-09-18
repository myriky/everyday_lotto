# everyday_lotto

**로또로 승부내자**

해당페이지를 참고하세요

https://realtor-in-action.tistory.com/3

## Getting Started

1. https://dhlottery.co.kr/ 회원가입
2. 예치금 입금

이후에 다음 과정을 진행하시면 됩니다.

```
$ copy .env.sample .env
```

**필수 사항**

```
DH_LOTTERY_USER_ID='ID를 입력하세요'
DH_LOTTERY_PASSWORD='비밀번호를 입력하세요'
```

선택 사항

```
AMOUNT_PER_DAY='1'
# 1~5 하루에 구매할 게임 수량을 입력하세요. 로또는 일주일에 5게임까지 구매 가능합니다.
```

```
SLACK_BOT_TOKEN='xoxb-000000000000-000000000000-000000000000000000000000'
SLACK_CHANNEL_ID='C0000000000'
```

샘플 코드는 구매와 동시에 Slack으로 메시지를 발송합니다.
Incoming-Webhook 대신 Slack App을 생성하시고 토큰을 생성해야됩니다.

아래 페이지를 참고하세요

https://api.slack.com/messaging/webhooks

```
$ npm install
$ npm run job

> everyday_lotto@1.0.0 job
> npx ts-node app.ts

=== 오 늘 의 로 또 ===
USER_ID => ******
USER_PASSWORD => ************
envionment loaded!
[1] navigate to DH LOTTERY login page...
[2] prepare login...
[3] try login...
[4] login completed!
[5] waiting for buy a game...
[6] 사장님 자동 1게임요~~
[7] waiting for confirm...
[8] confirming...
[9] remove unnecessary elements...
[10] screenshot...
SLACK_BOT_TOKEN => xoxb-000000000000-000000000000-000000000000000000000000
SLACK_CHANNEL => C0000000000
[11] job completed!
[C0000000000] Send image to slack completed!
```

## Github Actions 을 통한 자동화 시스템 구축

.github/workflows/action.yml

```
name: Everyday Lotto

env:
  DH_LOTTERY_USER_ID: ${{ secrets.DH_LOTTERY_USER_ID }}
  DH_LOTTERY_PASSWORD: ${{ secrets.DH_LOTTERY_PASSWORD }}
  AMOUNT_PER_DAY: ${{ vars.AMOUNT_PER_DAY }}
  SLACK_BOT_TOKEN: ${{ vars.SLACK_BOT_TOKEN }}
  SLACK_CHANNEL_ID: ${{ vars.SLACK_CHANNEL_ID }}

on:
  schedule:
    - cron: '55 1 * * 1-5'

jobs:
  lotto:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16.x]

    steps:
      - uses: actions/checkout@v3
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm run build --if-present
      - run: npm run job

```

cron schedule 문법은 아래를 참고하세요

https://crontab.guru/

## 주간 당첨 결과 알림

매주 토요일 추첨 후, 당첨번호와 이번 주 구매분의 당/낙첨 결과를 Slack으로 전송합니다.

```
$ npm run result
```

- 당첨번호: https://www.dhlottery.co.kr/lt645/result (로그인 불필요)
- 구매/당첨 내역: https://www.dhlottery.co.kr/mypage/mylotteryledger (로그인 필요, 최근 1주일)
- 추첨 직후 "추첨중" 상태면 10분 간격으로 재조회하며 최대 60분 대기합니다. (`RESULT_MAX_WAIT_MINUTES`로 조정)

.github/workflows/result.yml 이 토요일 23:00 KST (`0 14 * * 6` UTC)에 실행합니다.

> GitHub는 60일간 커밋이 없으면 스케줄 워크플로우를 자동 비활성화합니다. 멈춰 있으면 Actions 탭에서 다시 활성화하세요.
