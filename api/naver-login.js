// 네이버 로그인 시작점
// 사용자가 "네아로" 버튼을 클릭하면 이 함수가 실행됨
// → 네이버 로그인 페이지로 이동시켜 줌

export default function handler(req, res) {
  const CLIENT_ID    = process.env.NAVER_CLIENT_ID;
  const CALLBACK_URL = process.env.NAVER_CALLBACK_URL;

  // 보안을 위한 무작위 상태값 (CSRF 방지)
  const state = Math.random().toString(36).substring(2, 15);

  // 네이버 로그인 페이지 주소 만들기
  const naverAuthUrl =
    `https://nid.naver.com/oauth2.0/authorize` +
    `?response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` +
    `&state=${state}`;

  // 쿠키에 state 저장 (콜백에서 검증용)
  res.setHeader('Set-Cookie', `naver_state=${state}; HttpOnly; Path=/; Max-Age=300; SameSite=Lax`);

  // 네이버 로그인 페이지로 이동
  res.redirect(naverAuthUrl);
}
