/**
 * 스타일 모듈 통합 re-export
 * 모든 스타일 상수를 하나의 진입점에서 내보냅니다.
 */

// Color System
export { COLORS, TEXT_COLOR, BG_COLOR, BORDER_COLOR, DIVIDE_COLOR, RING_COLOR } from './colors';

// Typography
export { TYPOGRAPHY } from './typography';

// Layout & Components
export {
  LAYOUT,
  BADGE,
  ALERT,
  DIVIDER,
  TAG,
  TRANSITION_STYLES,
  TABLE,
  MODAL,
  ACTIVITY_LOG_BADGE,
} from './layout';

// Buttons & Inputs
export {
  BUTTON_BG_COLORS,
  BUTTON_STYLES,
  INPUT_STYLES,
  CHECKBOX_STYLES,
  FILE_INPUT_STYLES,
  LINK_STYLES,
  FILTER_BUTTON_STYLES,
  STEP_STYLES,
  DASHBOARD_ACTION_BUTTON,
  DASHBOARD_STATUS_BADGE,
} from './buttons';

// Navigation
export {
  NAV_BUTTON,
  GLASS_BUTTON,
  getThemeNavButton,
  SIDEBAR,
  BOTTOM_NAV,
  HEADER_NAV_TEXT,
  HEADER_NAV_BUTTON,
} from './navigation';

// Themes
export {
  COMPANY_THEME,
  HOME_SECTION_BG,
  HOME_SECTION_TEXT,
  HOME_CARD,
  PORTFOLIO_THEME,
} from './themes';

// Mobile & Floating
export { FLOATING_ACTIONS, MOBILE_SLIDE_MENU } from './mobile';

// Search
export { SEARCH_MODAL } from './search';

// Webhard
export { FOLDER_TREE, WEBHARD_STYLES, BADGE_STYLES } from './webhard';
