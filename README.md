# Argus AI (Hackathon MVP)

Nền tảng khảo thí trực tuyến thông minh – triển khai theo kế hoạch sprint trong `docs/argus-ai/`.

## Yêu cầu

- Node.js >= 18
- npm >= 7

## Cài đặt & chạy

```bash
cd argus-ai
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

### Biến môi trường

Tạo `.env.local` (tùy chọn) từ `.env.example`:

```bash
cp .env.example .env.local
```

- `AUTH_SECRET`: chuỗi bí mật dùng ký session (khuyến nghị đặt giá trị ngẫu nhiên đủ dài khi chạy demo/production).
- `AUTH_COOKIE_SECURE=true`: bật khi chạy sau HTTPS (mặc định tắt để hỗ trợ demo localhost HTTP).
- `AI_API_KEY` (hoặc `OPENAI_API_KEY`): khóa API để bật gợi ý chấm tự luận bằng AI (tùy chọn). Thiếu khóa → hệ thống fallback minh bạch, giáo viên vẫn chấm thủ công.
- `AI_MODEL` (hoặc `OPENAI_MODEL`, mặc định `gpt-4o-mini`), `AI_BASE_URL` (hoặc `OPENAI_BASE_URL`, mặc định OpenAI): cấu hình model/endpoint tương thích OpenAI Chat Completions. Gọi AI là server-side, best-effort, có timeout/fallback; không commit secret.

## Tài khoản demo (Sprint 01)

- **Email:** `teacher@example.com`
- **Mật khẩu:** `teacher123`
- **Vai trò:** Giáo viên (`TEACHER`)

> Lưu ý: Đây là tài khoản seed phục vụ MVP/hackathon, không dùng cho môi trường production thực tế.

## Phạm vi đã triển khai

### E1-S1-01 – Xác thực giáo viên (đăng nhập tối giản)
- Màn hình đăng nhập giáo viên (`/login`).
- Xác thực bằng tài khoản demo (seed), thông báo lỗi khi thiếu/sai thông tin.
- Tạo phiên đăng nhập bằng cookie `HttpOnly` (signed token), duy trì sau khi refresh.
- Bảo vệ khu vực quản lý `/exams` (chỉ giáo viên đã đăng nhập), redirect chưa đăng nhập về `/login`.
- Đăng xuất.

### E1-S1-02 – Tạo và quản lý thông tin cơ bản bài kiểm tra
- Danh sách bài kiểm tra của giáo viên (`/exams`) với trạng thái rỗng và bảng hiển thị: tên, trạng thái (Nháp/Đã xuất bản), thời lượng, thời gian mở/đóng.
- Tạo bài kiểm tra mới (`/exams/new`): tên (bắt buộc), mô tả (tùy chọn), thời lượng phút (bắt buộc, > 0), thời gian mở/đóng (tùy chọn).
- Validate client + server: trường bắt buộc, thời lượng hợp lệ, thời gian đóng phải sau thời gian mở; hiển thị lỗi rõ ràng theo trường.
- Lưu bài thi ở trạng thái `DRAFT`, gắn `ownerId` của giáo viên đăng nhập.
- Trang chi tiết/soạn đề (`/exams/[id]`): xem và chỉnh sửa thông tin cơ bản bài thi nháp.
- API: `GET/POST /api/exams`, `GET/PATCH /api/exams/[id]` (kiểm tra phiên, role TEACHER, quyền sở hữu).

### E1-S1-03 – Quản lý câu hỏi trắc nghiệm (MCQ – một đáp án đúng)
- Quản lý câu hỏi trắc nghiệm trong trang chi tiết bài thi nháp (`/exams/[id]`): thêm/sửa/xóa câu hỏi MCQ.
- Mỗi câu hỏi gồm: nội dung câu hỏi, danh sách phương án (tối thiểu 2, thêm/xóa phương án), chọn **một đáp án đúng** rõ ràng, và điểm (> 0).
- Validate client + server: thiếu nội dung, điểm không hợp lệ, < 2 phương án, phương án rỗng, chưa chọn/đáp án đúng không thuộc danh sách phương án.
- Lưu đáp án đúng tường minh bằng `correctOptionId` (tham chiếu ID phương án) để phục vụ chấm tự động ở E2.
- Thứ tự câu hỏi hiển thị ổn định (trường `order`), hỗ trợ xem lại đúng sau refresh; xóa có xác nhận.

### E1-S1-04 – Quản lý câu hỏi tự luận kèm Rubric chấm điểm
- Quản lý câu hỏi tự luận trong trang chi tiết bài thi nháp (`/exams/[id]`): thêm/sửa/xóa câu hỏi Essay kèm rubric theo tiêu chí.
- Mỗi câu tự luận gồm: nội dung/yêu cầu đề bài, thang điểm tối đa (> 0), và rubric có **ít nhất 1 tiêu chí**. Mỗi tiêu chí có tên, mô tả cách đánh giá và điểm tối đa (> 0).
- Validate client + server: thiếu prompt/điểm, rubric rỗng, tiêu chí thiếu tên/mô tả/điểm, **tổng điểm tối đa các tiêu chí phải khớp thang điểm câu hỏi** (hiển thị lỗi rõ ràng; UI hiển thị tổng điểm realtime).
- Rubric lưu có cấu trúc (`rubricCriteria[]` với `id`, `name`, `description`, `maxScore`, `order`) gắn với câu hỏi, sẵn sàng serialize cho AI gợi ý chấm theo từng tiêu chí ở E4. Xóa câu hỏi có xác nhận; dữ liệu hiển thị đúng sau refresh.
- API câu hỏi: `POST /api/exams/[id]/questions`, `PATCH/DELETE /api/exams/[id]/questions/[questionId]` (dispatch theo `type` MCQ/ESSAY, xóa dùng chung; chỉ owner, chỉ bài thi `DRAFT`).

### E1-S1-05 – Xuất bản bài thi và tạo link/mã tham gia
- Xuất bản bài thi nháp từ trang chi tiết (`/exams/[id]`): kiểm tra điều kiện phía server (owner, cấu hình cơ bản hợp lệ, **ít nhất 1 câu hỏi**), từ chối và hiển thị lý do cụ thể nếu chưa đáp ứng.
- Chuyển trạng thái `DRAFT` → `PUBLISHED`, lưu `publishedAt`, sinh **mã tham gia duy nhất** (`joinCode`, 8 ký tự, retry chống trùng) và đường dẫn tham gia `/join/{joinCode}` (chốt cho E2). Publish idempotent nếu đã xuất bản.
- Hiển thị mã/link tham gia sau khi publish và khi xem lại (panel + header/danh sách), hỗ trợ **sao chép mã/link**.
- Quy tắc truy cập: chỉ bài thi `PUBLISHED` mới được coi là hợp lệ để thí sinh tham gia (trạng thái hiển thị rõ; dữ liệu đủ để E2 kiểm tra). Route `/join/[code]` là trang tham gia thí sinh (E2).
- **Quyết định MVP (AC6 – Phương án A): khóa chỉnh sửa** nội dung/câu hỏi/rubric sau publish (server chặn 409/NOT_DRAFT, UI disable/ẩn chỉnh sửa), chỉ cho xem và sao chép mã/link.
- API: `POST /api/exams/[id]/publish` (bảo vệ phiên/role TEACHER, kiểm tra quyền sở hữu).

### E2-S2-01 – Tham gia bài thi bằng link/mã và kiểm tra điều kiện tham gia
- Thay placeholder `/join/[code]` bằng luồng tham gia thực tế: tra cứu theo `joinCode` (chuẩn hóa), chỉ cho phép bài thi `PUBLISHED`, kiểm tra cửa sổ `openAt`/`closeAt` (chưa mở/đã đóng/được phép) theo thời gian server.
- Hiển thị thông tin bài thi công khai (tên, thời lượng, thời gian mở/đóng, số câu) khi hợp lệ; thông báo từ chối rõ ràng với các case không hợp lệ.
- Form định danh thí sinh tối giản (**họ và tên** bắt buộc), validate client + server, UI trạng thái/lỗi thân thiện.
- API: `GET /api/join/[code]` trả availability công khai (không lộ `correctOptionId` hay dữ liệu owner nhạy cảm).

### E2-S2-02 – Check-in trước thi tối giản và khởi tạo phiên làm bài
- Bước check-in: thông báo/đồng ý giám sát tối giản (consent bắt buộc) và kiểm tra camera **best-effort** (granted/denied/unavailable/skipped) — không chặn luồng demo nếu camera không khả dụng.
- Khởi tạo attempt/lượt làm bài server-side (gắn `examId`, `joinCode`, thí sinh, consent, camera check): `startedAt` server, `deadlineAt = min(startedAt + durationMinutes, closeAt)` (nếu có), trạng thái `IN_PROGRESS`, đáp án khởi tạo theo câu hỏi.
- Ràng buộc: chỉ tạo attempt khi bài thi còn hợp lệ/đúng điều kiện; chuyển hướng vào `/attempts/[id]` sau khi thành công.
- API: `POST /api/join/[code]/start` (validate, tạo attempt, trả `attemptId`).

### E2-S2-03 – Giao diện làm bài, điều hướng câu hỏi và lưu đáp án
- Trang làm bài theo attempt `/attempts/[id]`: hiển thị câu hỏi MCQ/Essay theo `order` ổn định, điều hướng trước/sau/chọn câu, chỉ báo câu hiện tại và đã/chưa trả lời, tiến độ.
- MCQ chọn một phương án; Essay nhập văn bản; đáp án lưu server-side (debounce/flush khi chuyển câu/trước nộp) và khôi phục khi tải lại attempt `IN_PROGRESS`.
- Dữ liệu gửi cho thí sinh được **sanitize** (không lộ `correctOptionId`); upsert đáp án theo `questionId`, validate lựa chọn MCQ thuộc câu hỏi, chặn thao tác khi đã nộp/hết hạn.
- API: `GET /api/attempts/[id]` (candidate view), `PATCH /api/attempts/[id]/answers` (lưu đáp án, có thể auto-finalize nếu hết giờ).

### E2-S2-04 – Quản lý thời gian làm bài và nộp bài
- Đồng hồ đếm ngược theo `deadlineAt` (nguồn server), cảnh báo sắp hết giờ (≤ 5 phút, ≤ 1 phút), tự nộp khi hết giờ (client trigger + server enforce/finalize).
- Nộp thủ công có xác nhận và nhắc số câu chưa trả lời (vẫn cho phép nộp); sau nộp khóa chỉnh sửa và hiển thị trạng thái đã nộp (truy cập lại không quay về làm bài).
- Submit idempotent phía server, xử lý double-submit/hết hạn; lưu đáp án bị chặn khi attempt đã nộp.
- API: `POST /api/attempts/[id]/submit` (finalize + chấm MCQ, idempotent).

### E2-S2-05 – Chấm điểm tự động trắc nghiệm và lưu kết quả nộp bài
- Chấm MCQ server-side khi submit dựa trên `correctOptionId`/`points` (đúng = đủ điểm, sai/bỏ trống = 0), lưu tổng/chi tiết chấm MCQ trong attempt.
- Lưu đầy đủ đáp án Essay với trạng thái chờ chấm `PENDING` (phục vụ E4/E5); trạng thái tổng thể: `MCQ_GRADED` hoặc `MCQ_GRADED_PENDING_ESSAY_REVIEW`.
- Màn hình sau nộp hiển thị xác nhận, thời điểm nộp, tóm tắt **điểm trắc nghiệm tự động** (tổng đạt/tối đa) và ghi chú phần tự luận chờ chấm nếu có; **không lộ đáp án đúng/chi tiết đúng-sai từng câu** cho thí sinh.

### E3-S3 – Giám sát thi trực tuyến & Phát hiện dấu hiệu đáng ngờ (MVP, best-effort)
- **Ghi nhận sự kiện trình duyệt (E3-S3-01):** Trong phiên làm bài `IN_PROGRESS`, client ghi nhận tín hiệu `VISIBILITY_HIDDEN|VISIBLE`, `WINDOW_BLUR|FOCUS`, `FULLSCREEN_EXIT|ENTER` (kèm thời gian/ngữ cảnh), gửi về server theo batch bất đồng bộ/best-effort để **không chặn** làm bài, lưu đáp án hay nộp bài.
- **Lưu trữ & API giám sát (E3-S3-02):** Sự kiện proctoring lưu gắn `attemptId`/`examId` tại `data/proctoring.json` (demo). API `POST /api/attempts/[id]/proctoring/events` nhận/lưu sự kiện (bỏ qua ghi nếu attempt đã nộp để tránh race, giới hạn số lượng/kích thước); lỗi ghi nhận không làm hỏng luồng E2.
- **Tín hiệu/bằng chứng camera tối giản (E3-S3-03, best-effort):** Chỉ khi thí sinh đã đồng ý/cho phép camera và thiết bị khả dụng, hệ thống ghi nhận tín hiệu trạng thái/lỗi/track-ended và (khi khả thi) ảnh chụp minh chứng nhỏ, thưa, giới hạn. Không có phân tích CV/nhận diện; nếu không có camera/quyền thì chỉ fallback minh bạch.
- **Tổng hợp mức cảnh báo (E3-S3-04):** Heuristic rule-based MVP tổng hợp số liệu theo attempt và phân mức **dấu hiệu đáng ngờ** `NONE|LOW|MEDIUM|HIGH` kèm lý do từ số liệu. Nhãn trung tính, **không** tạo/lưu/hiển thị kết luận gian lận.
- **Báo cáo cho giáo viên (E3-S3-05):** Giáo viên (chủ sở hữu bài thi, đã đăng nhập) xem báo cáo tại `/exams/[id]/proctoring` (danh sách lượt + mức cảnh báo/tổng sự kiện) và `/exams/[id]/attempts/[attemptId]` (tóm tắt, thống kê theo loại, timeline, bằng chứng/tín hiệu camera nếu có). Truy cập được bảo vệ theo quyền sở hữu; thí sinh không truy cập được.

### E4-S4 – AI hỗ trợ chấm tự luận theo Rubric (Human-in-the-loop, MVP, best-effort)
- **Mô hình & lưu trữ chấm (E4-S4-01):** Mở rộng attempt (demo, tương thích ngược) để lưu `essayGradings[]` theo `attemptId/examId/questionId`: gợi ý AI (`aiSuggestion`, tách biệt) và đánh giá giáo viên (`teacherEvaluation` nháp/chốt), kèm trạng thái/tóm tắt tự luận (`essayResult`) và trạng thái tổng hợp. Normalize an toàn dữ liệu cũ (E2/E3).
- **Gợi ý AI theo rubric (E4-S4-02):** Giáo viên (owner) tạo/tạo lại gợi ý on-demand cho từng câu Essay qua API server-side. Prompt bám đề/rubric/câu trả lời, yêu cầu JSON có cấu trúc; parse/validate theo `criterionId` và ngưỡng `[0, maxScore]`, tính/chuẩn hóa tổng đề xuất. **Best-effort + fallback minh bạch** khi thiếu cấu hình/lỗi/timeout/output sai (không crash, không chặn chấm thủ công). Gợi ý AI **không** tự chốt điểm và **không** ghi đè điểm giáo viên đã nhập/chốt.
- **Workspace chấm cho giáo viên (E4-S4-03):** Trang `/exams/[id]/grading` liệt kê lượt làm bài với trạng thái/tiến độ chấm và tóm tắt điểm (MCQ, tự luận đã chốt, tổng). Trang `/exams/[id]/grading/[attemptId]` hiển thị đề bài, rubric, câu trả lời, gợi ý AI (nếu có) và form chấm; chỉ owner truy cập được.
- **Human-in-the-loop chỉnh sửa & chốt (E4-S4-04):** Giáo viên nhập/sửa điểm & nhận xét theo từng tiêu chí (hoặc áp dụng gợi ý AI vào form rồi rà soát), **lưu nháp** hoặc **chốt điểm**. Server validate điểm trong ngưỡng rubric/câu, tổng câu tính từ tiêu chí; lưu trạng thái `DRAFT/FINALIZED` và thời điểm; tạo lại gợi ý AI không làm mất đánh giá giáo viên.
- **Tổng hợp trạng thái & điểm (E4-S4-05):** Tổng tự luận chỉ tính câu **đã chốt**; tổng attempt = MCQ + tự luận đã chốt. Trạng thái cập nhật nhất quán (`PENDING`/`IN_REVIEW`/`FINALIZED`, `MCQ_GRADED_PENDING_ESSAY_REVIEW`/`ESSAY_GRADED`), tương thích attempts cũ. UI hiển thị “tạm tính/chưa hoàn tất” khi chưa chốt hết.

### E5-S5 – Kết quả, Báo cáo tổng hợp & Hoàn thiện demo (MVP)
- **Công bố/thu hồi kết quả theo lượt làm bài (E5-S5-01):** Attempt bổ sung `resultPublishedAt` (nullable, normalize tương thích ngược). Giáo viên **owner** có thể công bố/thu hồi kết quả cho attempt **đã nộp** qua API bảo vệ `PUT /api/exams/[id]/attempts/[attemptId]/result` (`{ published: boolean }`), idempotent khi công bố; trả về trạng thái công bố và mức sẵn sàng (đã chốt xong/chưa).
- **Kết quả cho thí sinh khi đã công bố (E5-S5-02):** Trang `/attempts/[id]` giữ xác nhận nộp khi chưa công bố; khi đã công bố hiển thị `publishedResult` đã **sanitize phía server**: tổng điểm, tóm tắt/chi tiết MCQ an toàn (không `correctOptionId`, không lộ đáp án đúng), điểm/nhận xét tự luận **chỉ từ đánh giá giáo viên đã chốt (FINALIZED)** theo tiêu chí rubric, và ghi rõ **tạm tính/chưa hoàn tất** nếu chưa chốt hết tự luận. Không hiển thị gợi ý AI, bản nháp hay dữ liệu giám sát cho thí sinh.
- **Báo cáo tổng hợp kết quả kỳ thi cho giáo viên (E5-S5-03):** Trang `/exams/[id]/results` (owner-only) tổng hợp theo bài thi: tóm tắt lượt/đã nộp/hoàn tất chấm/đã công bố và bảng attempt (trạng thái nộp, tiến độ/chốt chấm, điểm MCQ/tự luận đã chốt/tổng, mức **dấu hiệu đáng ngờ** giám sát, trạng thái công bố) kèm thao tác công bố/thu hồi và liên kết nhanh tới chấm/giám sát.
- **Hoàn thiện luồng demo (E5-S5-04):** Điều hướng chéo giữa chi tiết bài thi, chấm tự luận, giám sát và kết quả & công bố; nhãn/trạng thái nhất quán (nộp/chấm/công bố/tạm tính, dấu hiệu đáng ngờ).

> **Lưu trữ demo:** Bài thi/câu hỏi lưu tại `data/exams.json`; lượt làm bài/đáp án/kết quả/chấm/công bố lưu tại `data/attempts.json`; sự kiện/bằng chứng giám sát lưu tại `data/proctoring.json` (file-based JSON, đọc/ghi lại sau refresh trong cùng môi trường demo). Production cần thay bằng cơ sở dữ liệu.
>
> **Giới hạn MVP (E3, E4, E5):** Giám sát là **dấu hiệu đáng ngờ** (không kết luận, không CV). Chấm tự luận AI là **gợi ý hỗ trợ, best-effort** — **giáo viên phải rà soát và chốt điểm**; chỉ điểm đã chốt là kết quả tự luận chính thức. Công bố theo attempt; thí sinh xem qua `/attempts/[id]` (không có tài khoản thí sinh) và chỉ thấy dữ liệu được phép khi đã công bố. Không export, không thông báo realtime, store JSON không có locking/race protection.

## Luồng demo nhanh (E1 → E5)

1. Đăng nhập giáo viên (`/login`, tài khoản demo) → tạo bài thi, thêm câu hỏi MCQ/Essay+rubric → xuất bản để nhận mã/link.
2. Mở `/join/{joinCode}` → nhập họ tên → check-in (consent + camera best-effort) → bắt đầu làm bài.
3. Trong phiên làm bài, hệ thống ghi nhận (best-effort, không chặn) các **dấu hiệu đáng ngờ** từ trình duyệt/camera (nếu có). Trả lời câu hỏi, nộp bài (hoặc hết giờ tự nộp) → xem xác nhận và trạng thái chờ công bố.
4. Giáo viên mở **Giám sát** (`/exams/[id]/proctoring`) và **Chấm tự luận** (`/exams/[id]/grading`): (tuỳ chọn) tạo gợi ý AI theo rubric, rà soát/sửa và **chốt điểm** theo tiêu chí (HITL).
5. Giáo viên mở **Kết quả & công bố** (`/exams/[id]/results`) → xem báo cáo tổng hợp (nộp/chấm/điểm/dấu hiệu đáng ngờ/công bố) và **công bố kết quả** cho các lượt đã sẵn sàng (có cảnh báo nếu chưa chốt xong tự luận).
6. Thí sinh tải lại `/attempts/[id]` → xem kết quả đã công bố (MCQ an toàn, tự luận đã chốt, tổng; tạm tính nếu chưa hoàn tất), không thấy đáp án đúng/gợi ý AI/giám sát.

## Cấu trúc chính

- `src/features/auth/session.ts`, `src/features/auth/constants.ts` – xác thực demo, ký/xác minh session, helpers cookie & guard server-side.
- `src/features/auth/components/*` – UI đăng nhập/đăng xuất.
- `src/features/exams/domain.ts` – kiểu dữ liệu `Exam`/`Question` (MCQ/Essay), `RubricCriterion`, validate input, helpers thời gian.
- `src/features/exams/store.ts` – lưu trữ & CRUD bài thi/câu hỏi MCQ & Essay, publish, tra cứu theo `joinCode` (JSON file, server-only).
- `src/features/exams/components/*` – UI soạn đề: form bài thi, quản lý câu hỏi MCQ/Essay, panel xuất bản.
- `src/features/attempts/domain.ts` – kiểu dữ liệu attempt/answer/join/submit/công bố kết quả, validate, sanitize dữ liệu công khai (ẩn `correctOptionId`), tính `deadlineAt`, chuẩn hóa đáp án, build published result cho thí sinh (finalized-only).
- `src/features/attempts/grading.ts` – chấm MCQ server-side, khởi tạo/sync trạng thái & tổng hợp chấm tự luận theo exam/attempt.
- `src/features/attempts/store.ts` – lưu trữ lượt làm bài & dữ liệu chấm tự luận (`data/attempts.json`, server-only), normalize tương thích ngược, truy vấn attempts theo exam.
- `src/features/attempts/service.ts` – nghiệp vụ join/start/save/submit/get view, enforce thời gian, idempotent submit, auto-finalize, sync chấm tự luận, công bố/thu hồi kết quả (owner-guarded) và báo cáo tổng hợp kết quả kỳ thi.
- `src/features/attempts/components/*` – UI tham gia/check-in (`JoinFlow`) và làm/nộp bài (`AttemptRunner`, tích hợp giám sát best-effort E3).
- `src/features/essay-grading/domain.ts` – kiểu dữ liệu/validate/aggregate chấm tự luận (gợi ý AI, đánh giá giáo viên, tổng hợp) theo rubric.
- `src/features/essay-grading/ai.ts` – sinh gợi ý AI theo rubric (LLM best-effort, parse/validate/fallback).
- `src/features/essay-grading/service.ts` – nghiệp vụ chấm tự luận (context, quyền owner, tạo gợi ý, lưu nháp/chốt, tổng hợp).
- `src/features/essay-grading/components/*` – workspace UI chấm tự luận (HITL).
- `src/features/proctoring/domain.ts` – kiểu dữ liệu sự kiện/tổng hợp giám sát, metadata/snapshot normalize & giới hạn.
- `src/features/proctoring/store.ts` – lưu trữ sự kiện proctoring (`data/proctoring.json`, server-only).
- `src/features/proctoring/aggregate.ts` – heuristic tổng hợp mức cảnh báo **dấu hiệu đáng ngờ** (không kết luận).
- `src/features/proctoring/service.ts` – ghi nhận/truy xuất sự kiện và summary theo attempt.
- `src/features/proctoring/client.ts` – hook client thu thập sự kiện trình duyệt + tín hiệu/snapshot camera best-effort.
- `src/middleware.ts` – bảo vệ route `/exams`, điều hướng `/` và `/login` theo trạng thái phiên.
- `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts` – API đăng nhập/đăng xuất.
- `src/app/api/exams/route.ts`, `src/app/api/exams/[id]/route.ts` – API quản lý bài kiểm tra.
- `src/app/api/exams/[id]/publish/route.ts` – API xuất bản bài thi & sinh mã tham gia.
- `src/app/api/exams/[id]/questions/route.ts`, `src/app/api/exams/[id]/questions/[questionId]/route.ts` – API quản lý câu hỏi (MCQ/Essay).
- `src/app/api/join/[code]/route.ts`, `src/app/api/join/[code]/start/route.ts` – API tham gia & khởi tạo phiên làm bài.
- `src/app/api/attempts/[id]/route.ts`, `src/app/api/attempts/[id]/answers/route.ts`, `src/app/api/attempts/[id]/submit/route.ts` – API làm bài, lưu đáp án, nộp bài.
- `src/app/api/attempts/[id]/proctoring/events/route.ts` – API ghi nhận sự kiện giám sát theo attempt (best-effort).
- `src/app/api/exams/[id]/attempts/[attemptId]/grading/route.ts`, `src/app/api/exams/[id]/attempts/[attemptId]/grading/suggest/route.ts` – API chấm tự luận (đọc context, lưu nháp/chốt, tạo gợi ý AI) cho giáo viên owner.
- `src/app/api/exams/[id]/attempts/[attemptId]/result/route.ts` – API công bố/thu hồi kết quả theo lượt làm bài (owner-only).
- `src/app/login/page.tsx`, `src/app/exams/page.tsx`, `src/app/exams/new/page.tsx`, `src/app/exams/[id]/page.tsx` – khu vực giáo viên.
- `src/app/exams/[id]/proctoring/page.tsx`, `src/app/exams/[id]/attempts/[attemptId]/page.tsx` – báo cáo giám sát cho giáo viên (owner-only).
- `src/app/exams/[id]/grading/page.tsx`, `src/app/exams/[id]/grading/[attemptId]/page.tsx` – workspace chấm tự luận theo rubric (AI gợi ý, HITL) cho giáo viên owner.
- `src/app/exams/[id]/results/page.tsx` – báo cáo tổng hợp kết quả kỳ thi và công bố/thu hồi kết quả (owner-only).
- `src/app/join/[code]/page.tsx` – trang tham gia bài thi (thí sinh).
- `src/app/attempts/[id]/page.tsx` – trang làm/nộp/xem kết quả đã công bố (thí sinh).
- `src/lib/*`, `src/components/*` – shim tương thích re-export sang `features/*` (ổn định MVP sau refactor).
- `data/exams.json`, `data/attempts.json`, `data/proctoring.json` – dữ liệu demo (attempts lưu chấm tự luận/gợi ý/điểm chốt và `resultPublishedAt`).

## Scripts

- `npm run dev` – chạy development server
- `npm run lint` – kiểm tra lint
- `npm run build` – build production
- `npm run start` – chạy bản build

## Tài liệu dự án

- Ý tưởng & kế hoạch: `../docs/argus-ai/01-y-tuong-san-pham.md`
- Sprint 01 (Epic 1): `../docs/argus-ai/sprints/sprint-01-epic-1-nen-tang/`
- Sprint 02 (Epic 2): `../docs/argus-ai/sprints/sprint-02-epic-2-trai-nghiem-lam-bai/`
- Sprint 03 (Epic 3): `../docs/argus-ai/sprints/sprint-03-epic-3-giam-sat-phat-hien-dau-hieu-dang-ngo/`
- Sprint 04 (Epic 4): `../docs/argus-ai/sprints/sprint-04-epic-4-ai-ho-tro-cham-tu-luan-rubric/`
- Sprint 05 (Epic 5): `../docs/argus-ai/sprints/sprint-05-epic-5-ket-qua-bao-cao-tong-hop-hoan-thien-demo/`
