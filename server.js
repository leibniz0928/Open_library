// server.js
const express = require('express');
const db = require('./database'); // database.js 불러오기
const path = require('path');
const app = express();

//public 폴더를 정적 파일 경로로 지정
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());

app.get('/api/render', (req, res) => {
    const results = db.renderBooks();

    res.json({
        count: results.length,
        books: results
    })
})
app.get('/search', (req, res) => {
    const keyword = req.query.q; // 주소창의 ?q=... 부분을 가져옴

    if (!keyword) {
        return res.json({ message: "검색어를 입력해주세요." });
    }

    console.log(`🔎 검색 요청: ${keyword}`);

    // ★ DB에서 꺼내오기!
    const results = db.searchBooks(keyword);

    // 결과를 JSON으로 던져줌
    res.json({
        count: results.length,
        books: results
    });
});

// 2. 도서 상세 정보 API (ID로 조회)
// 사용법: http://localhost:3000/book/12345
// 2. 도서 상세 정보 API (ID로 조회)
// 사용법: http://localhost:3000/book/12345
app.get('/book/:id', (req, res) => {
    const bookId = req.params.id;
    const book = db.getBookById(bookId);

    if (book) {
        res.json(book);
    } else {
        res.status(404).json({ message: "책을 찾을 수 없습니다." });
    }
});

// ============================================
// 로그인 & 회원가입 & 예약 API 추가
// ============================================

// [API] 회원가입
app.post('/api/signup', (req, res) => {
    const { username, password, nickname } = req.body;
    // 간단 유효성 검사
    if (!username || !password || !nickname) {
        return res.json({ success: false, message: '모든 칸을 채워주세요.' });
    }

    const result = db.createUser(username, password, nickname);
    if (result.success) {
        res.json({ success: true, message: '회원가입 성공!' });
    } else {
        res.json({ success: false, message: result.error });
    }
});

// [API] 로그인
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.findUser(username, password);

    if (user) {
        res.json({ success: true, user: user });
    } else {
        res.json({ success: false, message: '아이디 또는 비밀번호가 틀렸습니다.' });
    }
});

// [API] 도서 예약
app.post('/api/reserve', (req, res) => {
    const { userId, bookId } = req.body;
    try {
        db.addReservation(userId, bookId);
        res.json({ success: true, message: '예약되었습니다.' });
    } catch (e) {
        console.error(e);
        // DB에서 던진 에러 메시지를 그대로 전달 (최대 3권, 이미 대출중 등)
        res.json({ success: false, message: e.message });
    }
});

// [API] 예약 연장
app.post('/api/extend', (req, res) => {
    const { reservationId, userId } = req.body;
    try {
        db.extendReservation(reservationId, userId);
        res.json({ success: true, message: '반납 기한이 7일 연장되었습니다.' });
    } catch (e) {
        console.error(e);
        res.json({ success: false, message: e.message });
    }
});

// [API] 예약 취소
app.post('/api/cancel', (req, res) => {
    const { reservationId, userId } = req.body;
    try {
        db.cancelReservation(reservationId, userId);
        res.json({ success: true, message: '예약이 취소되었습니다.' });
    } catch (e) {
        console.error(e);
        res.json({ success: false, message: e.message });
    }
});

// [API] 내 예약 목록
app.get('/api/user/:userId/reservations', (req, res) => {
    const userId = req.params.userId;
    try {
        const reservations = db.getUserReservations(userId);
        console.log(`[API] Returning reservations for user ${userId}:`, reservations);
        res.json({ success: true, reservations: reservations });
    } catch (e) {
        console.error(e);
        res.json({ success: false, message: '목록을 불러오는 중 오류가 발생했습니다.' });
    }
});

app.listen(3000, () => {
    console.log('📚 도서관 서버가 켜졌습니다! http://localhost:3000');
});