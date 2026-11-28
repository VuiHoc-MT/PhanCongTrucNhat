import { createNewWeekHeaders, weekHeaders } from './constants.js';

export function getDefaultClassData() {
  return {
    students: [],
    schedule: {},
    weekHeaders: createNewWeekHeaders(),
    notice: "Chưa có thông tin báo bài mới.",
    createdAt: Date.now()
  };
}

export const state = {
  isAdmin: false,
  isGuest: false,
  guestName: null,
  currentUser: null,
  classesData: {},
  currentClassId: null,
  currentClassData: {
    students: [],
    schedule: {},
    weekHeaders: weekHeaders,
    notice: "Chưa có thông tin báo bài mới."
  },
  currentClassListener: null,
  classesListListener: null,
  authCheckSeq: 0,
  tapSelectedStudent: null,
  
  // Random page state
  randomSpinning: false,
  randomNames: [],
  randomFlowers: [],
  randomButterflies: [],
  randomRAF: null,
  randomDrawStart: 0,
  randomDrawState: null,
  randomDrawTimer: null,
  randomCountdownTimer: null,
  
  // Week butterfly state
  weekButterflyEls: [],
  weekButterflyStates: [],
  weekButterflyRAF: null,
  weekButterflyLast: 0,
  weekButterflyCache: { dirty: true, bounds: null },
  
  // Chat & Post listeners
  chatListener: null,
  postsListener: null,
  guestsListener: null,
  baoPostsCache: {},
  baoLatestPostsVal: null,
  
  // Navigation
  currentTab: 'about',
  publicBrowsing: false,
  pendingHashTab: (window.location.hash || '').replace('#', '')
};
