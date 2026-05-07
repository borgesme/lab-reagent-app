export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/home/index',
    'pages/search/index',
    'pages/my-requests/index',
    'pages/approvals/index',
    'pages/notifications/index',
    'pages/report-summary/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '实验室试剂',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#888888',
    selectedColor: '#1677ff',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/home/index', text: '工作台' },
      { pagePath: 'pages/my-requests/index', text: '申请' },
      { pagePath: 'pages/approvals/index', text: '审批' },
      { pagePath: 'pages/notifications/index', text: '消息' },
    ],
  },
});
