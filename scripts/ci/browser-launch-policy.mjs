/** Pinned Chrome for Testing156 Windows mitigation, upstream Playwright#43327.
 * Disable its native sampling profiler; retain rendering, video, traces, PWA,
 * all assertions and the exact pinned executable. No retry or crash suppression.
 */
export function browserLaunchOptions(browserName,executablePath,platform=process.platform){
 if(!['chromium','firefox','webkit'].includes(browserName)||typeof executablePath!=='string'||!executablePath)throw Error('PINNED_BROWSER_LAUNCH_REQUIRED');
 return {executablePath,...(platform==='win32'&&browserName==='chromium'?{args:['--disable-stack-profiler']}:{})};
}
