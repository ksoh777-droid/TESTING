// 네이버 로그인 완료 후 실행되는 심부름꾼
// 네이버가 "이 사람 맞아요" 하고 code를 보내주면:
//   1. code → 네이버 Access Token 교환
//   2. Access Token → 사용자 프로필 조회
//   3. Firebase Custom Token 발급
//   4. 웹사이트로 돌아가서 자동 로그인

import * as admin from 'firebase-admin';

// Firebase Admin 초기화 (한 번만)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  // 네이버에서 오류가 온 경우
  if (error || !code) {
    return res.redirect(`/?login_error=naver_denied`);
  }

  try {
    // ── STEP 1: code → Access Token 교환 ──────────────────
    const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     process.env.NAVER_CLIENT_ID,
        client_secret: process.env.NAVER_CLIENT_SECRET,
        code,
        state,
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      throw new Error('네이버 토큰 발급 실패: ' + JSON.stringify(tokenData));
    }

    // ── STEP 2: Access Token → 사용자 프로필 조회 ──────────
    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = await profileRes.json();

    if (profileData.resultcode !== '00') {
      throw new Error('네이버 프로필 조회 실패');
    }

    const naverUser = profileData.response;
    const uid       = `naver:${naverUser.id}`;        // Firebase용 고유 ID
    const name      = naverUser.name  || naverUser.nickname || '네이버 사용자';
    const email     = naverUser.email || `${naverUser.id}@naver.local`;

    // ── STEP 3: Firestore에 회원 정보 저장/업데이트 ────────
    const db = admin.firestore();
    await db.collection('users').doc(uid).set({
      name,
      email,
      provider:  'naver',
      naverId:   naverUser.id,
      role:      'user',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // createdAt은 최초 가입 시에만 설정
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.data()?.createdAt) {
      await db.collection('users').doc(uid).update({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // ── STEP 4: Firebase Custom Token 발급 ────────────────
    const customToken = await admin.auth().createCustomToken(uid, {
      name,
      email,
      provider: 'naver',
    });

    // ── STEP 5: 웹사이트로 돌아가기 (토큰 전달) ───────────
    // 토큰을 URL 파라미터로 전달 (짧은 시간 유효, 안전)
    const redirectBase = process.env.SITE_URL || '/';
    res.redirect(`${redirectBase}?naver_token=${customToken}&naver_name=${encodeURIComponent(name)}&naver_email=${encodeURIComponent(email)}`);

  } catch (err) {
    console.error('[Naver Callback Error]', err);
    res.redirect(`/?login_error=${encodeURIComponent(err.message)}`);
  }
}
