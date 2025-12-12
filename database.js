const Database = require('better-sqlite3');

// 1. DB 파일 열기 (없으면 자동으로 'library.db' 파일을 생성해줌!)
const db = new Database('library.db', { verbose: console.log });

// 2. 테이블(데이터 담을 표) 만들기
const createTableQuery = `
    CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT,
        imgUrl TEXT,
        author TEXT,
        publisher TEXT,
        callNum TEXT,
        location TEXT,
        status TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        nickname TEXT
    );
    CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        book_id TEXT,
        date TEXT,
        due_date TEXT,
        extension_count INTEGER DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(book_id) REFERENCES books(id)
    );
`;
db.exec(createTableQuery);

// 기존 테이블에 컬럼이 없을 경우를 대비한 마이그레이션 (간단하게 처리)
try {
    db.exec("ALTER TABLE reservations ADD COLUMN due_date TEXT");
} catch (e) { /* 이미 있으면 패스 */ }
try {
    db.exec("ALTER TABLE reservations ADD COLUMN extension_count INTEGER DEFAULT 0");
} catch (e) { /* 이미 있으면 패스 */ }


// 3. 책 저장하는 함수 (외부에서 쓸 수 있게)
const saveBooks = (bookList) => {
    const insert = db.prepare(`
        INSERT OR REPLACE INTO books (id, title,imgUrl, author, publisher, callNum,location, status)
        VALUES (@id, @title,@imgUrl, @author, @publisher,@callNum, @location, @status)
    `);

    const insertMany = db.transaction((books) => {
        for (const book of books) {
            insert.run(book);
        }
    });

    insertMany(bookList);
    console.log(`${bookList.length}권 저장 완료!`);
};

// 4. 책 검색하는 함수 (나중에 대출 시스템에서 쓸 것)
// database.js (기존 내용 아래에 추가)
const renderBooks = () => {
    const query = db.prepare(`
        SELECT * FROM books LIMIT 20
    `);
    return query.all();
}
// [기능 1] 제목으로 책 검색하기 (가장 많이 씀)
const searchBooks = (keyword) => {
    // LIKE %keyword% : 앞뒤에 뭐가 붙든 그 단어가 포함되면 찾아라
    // ORDER BY title : 제목 가나다순 정렬
    // LIMIT 50 : 너무 많이 나오면 렉걸리니까 50개만
    const query = db.prepare(`
        SELECT * FROM books 
        WHERE title LIKE ? 
        OR author LIKE ?
        LIMIT 20
    `);

    return query.all(`%${keyword}%`, `%${keyword}%`);
};

// [기능 2] ID로 책 딱 한 권만 가져오기 (대출 처리할 때 필요)
const getBookById = (id) => {
    const query = db.prepare('SELECT * FROM books WHERE id = ?');
    return query.get(id); // .get()은 딱 하나만 가져올 때 씀
};

// [기능 3] 대출 가능한 책만 보기 (필터링 예시)
const getAvailableBooks = () => {
    // status에 '대출가능'이나 '열람가능'이 포함된 것 찾기
    const query = db.prepare(`
        SELECT * FROM books 
        WHERE status LIKE '%가능%'
        LIMIT 20
    `);
    return query.all();
};

// ============================================
// 유저 & 예약 관련 기능 추가
// ============================================

// [유저 생성] 회원가입
const createUser = (username, password, nickname) => {
    try {
        const query = db.prepare(`
            INSERT INTO users (username, password, nickname)
            VALUES (?, ?, ?)
        `);
        const result = query.run(username, password, nickname);
        return { success: true, id: result.lastInsertRowid };
    } catch (error) {
        // 이미 있는 아이디일 경우 등
        console.error(error);
        return { success: false, error: '이미 존재하는 아이디거나 오류가 발생했습니다.' };
    }
};

// [유저 찾기] 로그인용
const findUser = (username, password) => {
    const query = db.prepare(`
        SELECT id, nickname FROM users 
        WHERE username = ? AND password = ?
    `);
    return query.get(username, password);
};

// [예약 추가] - 트랜잭션 적용 (최대 3권, 상태 변경, 반납일 설정)
const addReservation = (userId, bookId) => {
    if (!userId) throw new Error("사용자 ID가 없습니다.");
    if (!bookId) throw new Error("도서 ID가 없습니다.");

    // 1. 현재 빌린 책 개수 확인
    const countFn = db.prepare('SELECT COUNT(*) as count FROM reservations WHERE user_id = ?');
    const currentCount = countFn.get(userId).count;

    if (currentCount >= 3) {
        throw new Error("최대 3권까지만 예약할 수 있습니다.");
    }

    const transaction = db.transaction(() => {
        // 2. 책 상태 다시 확인 (트랜잭션 내부에서 최신 상태 확인 권장)
        const bookStatusFn = db.prepare('SELECT status FROM books WHERE id = ?');
        const book = bookStatusFn.get(bookId);

        // "가능"이라는 글자가 없으면 대출 불가로 판단
        if (!book || !book.status.includes('가능')) {
            throw new Error("이미 대출중이거나 예약할 수 없는 도서입니다.");
        }

        // 날짜 계산 (오늘, 7일 뒤)
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(today.getDate() + 7);

        const dateStr = today.toISOString().split('T')[0];
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // 예약 추가
        const insert = db.prepare(`
            INSERT INTO reservations (user_id, book_id, date, due_date, extension_count)
            VALUES (?, ?, ?, ?, 0)
        `);
        insert.run(userId, bookId, dateStr, dueDateStr);

        // 책 상태 변경
        const updateBook = db.prepare(`
            UPDATE books SET status = '대출중' WHERE id = ?
        `);
        updateBook.run(bookId);
    });

    transaction();
    return true;
};

// [예약 연장] - 1회만 가능, 7일 연장
const extendReservation = (reservationId, userId) => {
    const transaction = db.transaction(() => {
        // 현재 예약 정보 확인
        const resFn = db.prepare('SELECT * FROM reservations WHERE id = ? AND user_id = ?');
        const reservation = resFn.get(reservationId, userId);

        if (!reservation) throw new Error("예약 정보를 찾을 수 없습니다.");
        if (reservation.extension_count >= 1) throw new Error("연장은 한 번만 가능합니다.");

        // 날짜 연장
        const currentDueDate = new Date(reservation.due_date);
        currentDueDate.setDate(currentDueDate.getDate() + 7);
        const newDueDateStr = currentDueDate.toISOString().split('T')[0];

        const update = db.prepare(`
            UPDATE reservations 
            SET due_date = ?, extension_count = extension_count + 1 
            WHERE id = ?
        `);
        update.run(newDueDateStr, reservationId);
    });

    transaction();
    return true;
};

// [예약 취소] - 책 상태 '대출가능'으로 복구
const cancelReservation = (reservationId, userId) => {
    const transaction = db.transaction(() => {
        // 예약 정보 확인 (본인 예약인지)
        const resFn = db.prepare('SELECT book_id FROM reservations WHERE id = ? AND user_id = ?');
        const reservation = resFn.get(reservationId, userId);

        if (!reservation) {
            throw new Error("예약 정보를 찾을 수 없습니다.");
        }

        // 예약 삭제
        const del = db.prepare('DELETE FROM reservations WHERE id = ?');
        del.run(reservationId);

        // 책 상태 복구
        const updateBook = db.prepare(`
            UPDATE books SET status = '가능' WHERE id = ?
        `);
        updateBook.run(reservation.book_id);
    });

    transaction();
    return true;
};

// [내 예약 목록 보기]
const getUserReservations = (userId) => {
    // JOIN을 써서 책 정보까지 같이 가져오기
    const query = db.prepare(`
        SELECT r.id as reservation_id, r.date, r.due_date, r.extension_count, b.* 
        FROM reservations r
        JOIN books b ON r.book_id = b.id
        WHERE r.user_id = ?
    `);
    return query.all(userId);
};

// ★ 중요: 만든 함수들을 밖으로 내보내야 server.js에서 씁니다.
module.exports = {
    saveBooks,
    searchBooks,
    renderBooks,
    getBookById,
    getAvailableBooks,
    createUser,
    findUser,
    addReservation,
    extendReservation,
    cancelReservation,
    getUserReservations
};