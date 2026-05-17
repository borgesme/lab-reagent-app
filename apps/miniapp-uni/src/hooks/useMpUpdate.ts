/**
 * 检查小程序版本更新
 * - 仅小程序平台（微信/支付宝/百度/字节等）支持 UpdateManager
 * - canIUse('getUpdateManager') 兜底：H5 / App-plus 自动跳过
 * - 典型用法：在 App.vue 的 onShow 中调用 checkUpdate()
 */
export function useMpUpdate() {
  function checkUpdate(): void {
    if (!uni.canIUse('getUpdateManager')) return;

    const updateManager = uni.getUpdateManager();

    updateManager.onCheckForUpdate((res) => {
      console.log('[mp-update] hasUpdate', res.hasUpdate);
    });

    updateManager.onUpdateReady(() => {
      uni.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success: (res) => {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        },
      });
    });

    updateManager.onUpdateFailed(() => {
      uni.showModal({
        title: '已经有新版本了',
        content: '新版本已经上线啦，请您删除当前小程序，重新搜索打开哟~',
      });
    });
  }

  return { checkUpdate };
}
