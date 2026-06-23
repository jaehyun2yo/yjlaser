/**
 * API 응답 표준 타입 정의
 *
 * 모든 서버 액션과 API 응답에 사용되는 표준 타입입니다.
 */

/**
 * 기본 API 응답 타입
 *
 * @template T - 성공 시 반환되는 데이터 타입
 *
 * @example
 * ```typescript
 * async function getData(): Promise<ApiResponse<User>> {
 *   try {
 *     const user = await fetchUser();
 *     return { success: true, data: user };
 *   } catch (error) {
 *     return { success: false, error: error.message };
 *   }
 * }
 * ```
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 목록 API 응답 타입
 *
 * 배열 데이터와 함께 전체 개수를 포함합니다.
 *
 * @template T - 목록 항목의 타입
 *
 * @example
 * ```typescript
 * async function getUsers(): Promise<ApiListResponse<User>> {
 *   const users = await fetchUsers();
 *   return { success: true, data: users, total: users.length };
 * }
 * ```
 */
export interface ApiListResponse<T = unknown> {
  success: boolean;
  data?: T[];
  total?: number;
  error?: string;
}

/**
 * 서버 액션 결과 타입
 *
 * 성공/실패가 명확히 구분되는 discriminated union 타입입니다.
 * TypeScript의 타입 가드가 자동으로 동작합니다.
 *
 * @template T - 성공 시 반환되는 데이터 타입
 *
 * @example
 * ```typescript
 * async function createItem(data: ItemInput): Promise<ActionResult<Item>> {
 *   try {
 *     const item = await saveItem(data);
 *     return { success: true, data: item };
 *   } catch (error) {
 *     return { success: false, error: error.message };
 *   }
 * }
 *
 * // 사용 시
 * const result = await createItem(input);
 * if (result.success) {
 *   const item = result.data; // Item 타입으로 추론
 * } else {
 *   const message = result.error; // string 타입으로 추론
 * }
 * ```
 */
export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * 선택적 리다이렉트 URL을 포함하는 서버 액션 결과 타입
 *
 * 주로 로그인/회원가입 등 성공 후 리다이렉트가 필요한 경우 사용합니다.
 *
 * @template T - 성공 시 반환되는 데이터 타입
 *
 * @example
 * ```typescript
 * async function login(credentials: LoginInput): Promise<ActionResultWithRedirect<User>> {
 *   const user = await authenticate(credentials);
 *   return { success: true, data: user, redirectUrl: '/dashboard' };
 * }
 * ```
 */
export type ActionResultWithRedirect<T = unknown> =
  | { success: true; data?: T; redirectUrl?: string }
  | { success: false; error: string };

/**
 * 카운트만 반환하는 서버 액션 결과 타입
 *
 * 주로 생성/삭제 개수를 반환할 때 사용합니다.
 *
 * @example
 * ```typescript
 * async function createTestItems(count: number): Promise<ActionResultWithCount> {
 *   const created = await bulkCreate(count);
 *   return { success: true, count: created.length };
 * }
 * ```
 */
export type ActionResultWithCount =
  | { success: true; count: number }
  | { success: false; error: string };

/**
 * 빈 성공 응답 타입
 *
 * 데이터가 필요 없는 단순 성공/실패 응답에 사용합니다.
 *
 * @example
 * ```typescript
 * async function deleteItem(id: string): Promise<VoidActionResult> {
 *   await remove(id);
 *   return { success: true };
 * }
 * ```
 */
export type VoidActionResult = { success: true } | { success: false; error: string };
