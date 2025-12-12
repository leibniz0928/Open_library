async function renderBooks() {
    try {
        const response = await fetch('/api/render');
        const data = await response.json();
        displayBooks(data.books);
    }
    catch (e) {
        console.error(e);
    }
}

async function searchBooks() {
    const input = document.getElementById('keyword').value;

    try {
        //server한테 검색해달라고 요청
        const response = await fetch(`/search?q=${input}`);
        const data = await response.json();

        // 받아온 데이터를 화면에 그리기
        displayBooks(data.books);
    } catch (e) {
        console.error(e);
    }
}

function displayBooks(books) {
    const list = document.getElementById('result-list');
    list.innerHTML = ''; // 기존 목록 지우기

    if (!books || books.length === 0) {
        list.innerHTML = '<li class="no-result" style="text-align: center; padding: 40px; color: #666;">검색 결과가 없습니다.</li>';
        return;
    }

    books.forEach(book => {
        const li = document.createElement('li');
        li.className = 'book-card';

        li.onclick = () => {
            window.location.href = `detail.html?id=${book.id}`
        }
        // 이미지 URL 처리 (없으면 기본 이미지)
        const imgUrl = book.imgUrl || '../img/book_img.png';

        let status = "";
        let avialable = "";
        if (book.status === "가능") {
            status = "대출가능";
            avialable = "status-available";
        }
        else {
            status = "대출불가능";
            avialable = "status-unavailable";
        }
        // 구조화된 HTML 생성
        li.innerHTML = `
            <img src="${imgUrl}" alt="${book.title}" class="book-cover">
            <div class="book-info">
                <div class="book-title">${book.title}</div>
                <div class="book-author">${book.author}</div>
                <div class="book-author">${book.callNum}</div>
                <div class="book-location">
                    <span>📍 ${book.location}</span>
                </div>
                <div class="book-status ${avialable}">${status}</div>
            </div>
        `;
        list.appendChild(li);
    });
}

// Auth UI Update
function updateAuthUI() {
    const startContainer = document.querySelector('.topright') || document.getElementById('userNav');
    if (!startContainer) return;

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));

    if (currentUser) {
        // 로그인 상태
        startContainer.innerHTML = `
            <span style="margin-right: 10px; font-weight: bold;">${currentUser.nickname}님</span>
            <button onclick="location.href='/my_library.html'" class="btn-text">내 서재</button>
            <button onclick="logout()" class="btn-text" style="color: red;">로그아웃</button>
        `;
    } else {
        // 비회원 상태
        // 기존 버튼들이 이미 있으면 굳이 건드리지 않아도 되지만, 통일성을 위해 재렌더링
        startContainer.innerHTML = `
            <button onclick="location.href='/login.html'" class="btn-text">로그인</button>
            <button onclick="location.href='/signup.html'" class="btn-primary">회원가입</button>
        `;
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    alert('로그아웃 되었습니다.');
    window.location.href = '/';
}

// Enter key support for search
const keywordInput = document.getElementById('keyword');
if (keywordInput) {
    keywordInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            searchBooks();
        }
    });
}

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();

    // 메인 페이지인 경우에만 책 목록 렌더링
    if (document.getElementById('result-list')) {
        renderBooks();
    }
});