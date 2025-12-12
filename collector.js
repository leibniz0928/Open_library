const axios = require('axios');
const https = require('https');
const db = require('./database');

// agent 설정 (keepAlive를 true로 설정하여 연결 재사용 권장)
const agent = new https.Agent({ 
    rejectUnauthorized: false,
    keepAlive: true 
});
// 에러 났을 때만 잠깐 쉬기 위한 용도
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// ★ 핵심 설정: 동시 요청 수 조절
// 너무 높으면 서버 차단 위험. 5~10 권장.
const CONCURRENCY_LIMIT = 5; 
const PAGE_SIZE = 20;
// ==========================================

// [헬퍼 함수] 한 페이지의 데이터를 가져와서 DB에 저장하는 역할
async function fetchAndSavePage(keyword, offset, retryCount = 0) {
    const MAX_RETRIES = 3;
    try {
        const response = await axios.get("https://pyxis.knu.ac.kr/pyxis-api/1/collections/1/search", {
            params: {
                all: `${keyword}|k|a|0`,
                facet: false,
                max: PAGE_SIZE,
                offset: offset
            },
            httpsAgent: agent,
            timeout: 10000 // 10초 타임아웃 설정 권장
        });

        const rawList = response.data.data.list;
        if (!rawList || rawList.length === 0) return 0; // 데이터 없음

        // 데이터 정제
        const cleanList = rawList.map(book => {
            // 안전한 접근을 위한 옵셔널 체이닝(?.) 사용
            const firstVolume = book.branchVolumes?.[0];
            return {
                id: String(book.id),
                title: book.titleStatement,
                imgUrl: book.thumbnailUrl || null,
                author: book.author,
                publisher: book.publication,
                callNum: firstVolume?.volume || '청구기호 없음',
                location: firstVolume?.name || '도서관',
                status: '가능'
            };
        });

        // ★ 중요: DB 저장도 비동기(await)로 처리해야 메인 스레드가 안 멈춥니다.
        // database.js의 saveBooks 함수가 async 함수여야 합니다.
        await db.saveBooks(cleanList);
        
        process.stdout.write('.'); // 진행 상황 점 찍기
        return cleanList.length;

    } catch (err) {
        if (retryCount < MAX_RETRIES) {
            // 실패 시 재시도 로직 (선택 사항)
            // console.log(`\n[Offset ${offset}] 재시도 ${retryCount+1}...`);
            await sleep(1000 * (retryCount + 1)); // 점점 길게 대기
            return fetchAndSavePage(keyword, offset, retryCount + 1);
        } else {
            console.error(`\n❌ [Offset ${offset}] 최종 실패:`, err.message);
            return 0; // 이 페이지는 건너뜀
        }
    }
}


async function collectPyxisBooks() {
    const keywords = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    console.log(`📚 경북대 Pyxis 도서관 데이터 고속 수집 시작 (동시성: ${CONCURRENCY_LIMIT})...`);

    for (const keyword of keywords) {
        console.log(`\n🔍 키워드 [ ${keyword} ] 수집 준비...`);

        // 1. 전체 개수 파악
        let totalCount = 0;
        try {
            // ... 기존과 동일한 첫 요청 코드 ...
            const firstRes = await axios.get("https://pyxis.knu.ac.kr/pyxis-api/1/collections/1/search", {
                params: { all: `${keyword}|k|a|0`, facet: false, max: 1, offset: 0 },
                httpsAgent: agent
            });
             if (firstRes.data.code !== 'success.retrieved') continue;
            totalCount = firstRes.data.data.totalCount;
            console.log(`   총 ${totalCount}권 대상.`);
        } catch (e) {
            console.error("   초기 접속 실패:", e.message);
            continue;
        }

        if (totalCount === 0) continue;

        // 2. 병렬 처리를 위한 배치 루프
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        let processedPages = 0;

        // offset을 기준으로 루프를 돌되, CONCURRENCY_LIMIT 만큼씩 건너뜀
        for (let i = 0; i < totalCount; i += (PAGE_SIZE * CONCURRENCY_LIMIT)) {
            
            // 한 번에 던질 프로미스(요청) 묶음 생성
            const promises = [];
            for (let j = 0; j < CONCURRENCY_LIMIT; j++) {
                const currentOffset = i + (j * PAGE_SIZE);
                if (currentOffset >= totalCount) break;

                // 요청을 시작하고 프로미스를 배열에 넣음 (아직 기다리지 않음)
                promises.push(fetchAndSavePage(keyword, currentOffset));
            }

            // ★ 핵심: 묶음으로 던진 요청들이 모두 끝날 때까지 여기서 기다림
            if (promises.length > 0) {
                 await Promise.all(promises);
                 processedPages += promises.length;
                 process.stdout.write(`\r   [${keyword}] 진행률: 약 ${Math.round((processedPages / totalPages) * 100)}% `);
            }
        }
        console.log(`\n   [${keyword}] 완료!`);
    }
    console.log("\n🎉 모든 수집 종료!");
}

collectPyxisBooks();