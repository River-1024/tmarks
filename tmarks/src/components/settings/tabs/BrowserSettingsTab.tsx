import { Chrome, Shield, ExternalLink, Download, Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { InfoBox } from '../InfoBox'

export function BrowserSettingsTab() {
  const navigate = useNavigate()

  const handleDownload = (browser: 'chrome' | 'firefox' | 'edge' | 'opera' | 'brave' | '360' | 'qq' | 'sogou') => {
    const link = document.createElement('a')
    link.href = `/extensions/tmarks-extension-${browser}.zip`
    link.download = `tmarks-extension-${browser}.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const browsers = [
    { id: 'chrome', name: 'Chrome', icon: Chrome, color: 'text-blue-500' },
    { id: 'edge', name: 'Edge', icon: Chrome, color: 'text-cyan-500' },
    { id: 'firefox', name: 'Firefox', icon: Chrome, color: 'text-orange-500' },
    { id: 'brave', name: 'Brave', icon: Chrome, color: 'text-orange-600' },
    { id: 'opera', name: 'Opera', icon: Chrome, color: 'text-red-500' },
    { id: '360', name: '360', icon: Chrome, color: 'text-green-500' },
    { id: 'qq', name: 'QQ', icon: Chrome, color: 'text-blue-600' },
    { id: 'sogou', name: '搜狗', icon: Chrome, color: 'text-purple-500' },
  ]

  return (
    <div className="space-y-6">
      {/* 浏览器插件 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">浏览器插件</h3>
            <p className="text-sm text-muted-foreground mt-1">
              安装浏览器扩展，快速保存和管理书签
            </p>
          </div>
          <button
            onClick={() => navigate('/extension')}
            className="btn btn-secondary flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            查看详情
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {browsers.map((browser) => {
            const Icon = browser.icon
            return (
              <button
                key={browser.id}
                onClick={() => handleDownload(browser.id as any)}
                className="p-3 sm:p-4 rounded-xl border-2 border-border hover:border-primary/50 transition-all text-center group"
              >
                <Icon className={`w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-1 sm:mb-2 ${browser.color}`} />
                <div className="text-xs sm:text-sm font-medium mb-0.5 sm:mb-1">{browser.name}</div>
                <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs text-muted-foreground group-hover:text-primary">
                  <Download className="w-3 h-3" />
                  点击下载
                </div>
              </button>
            )
          })}
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">
            💡 提供 8 个浏览器专用版本，也可以使用 Chrome 通用版（支持所有基于 Chrome 的浏览器）
          </p>
        </div>
      </div>

      <div className="border-t border-border"></div>

      {/* 浏览器权限 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">浏览器权限设置</h3>
          <p className="text-sm text-muted-foreground mt-1">
            配置 TMarks 所需的浏览器权限，以获得最佳使用体验
          </p>
        </div>

        {/* 弹窗权限说明 */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-start gap-3">
            <ExternalLink className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold mb-2">弹窗权限</h4>
              <p className="text-xs text-muted-foreground mb-3">
                允许 TMarks 打开弹窗，以便使用"一键打开全部标签页"功能。
              </p>
              <div className="text-xs text-muted-foreground space-y-2">
                <p className="font-medium">如何允许弹窗？</p>
                <ol className="space-y-1 ml-4 list-decimal">
                  <li>在标签页组详情页面，点击"全部恢复"按钮</li>
                  <li>浏览器地址栏会出现弹窗拦截图标（通常在右侧）</li>
                  <li>点击该图标，选择"始终允许显示弹出式窗口"</li>
                  <li>刷新页面后，再次点击"全部恢复"即可正常使用</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* 各浏览器设置方法 */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">各浏览器设置方法</h4>
          
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-sm font-medium mb-1">Chrome / Edge</div>
            <div className="text-xs text-muted-foreground">
              地址栏右侧会出现 🚫 图标，点击后选择"始终允许弹出式窗口和重定向"
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-sm font-medium mb-1">Firefox</div>
            <div className="text-xs text-muted-foreground">
              地址栏左侧会出现弹窗拦截提示，点击"选项" → "允许弹出式窗口"
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-sm font-medium mb-1">Safari</div>
            <div className="text-xs text-muted-foreground">
              菜单栏：Safari → 设置 → 网站 → 弹出式窗口 → 找到当前网站 → 选择"允许"
            </div>
          </div>
        </div>

        {/* 为什么需要权限 */}
        <div className="p-4 rounded-lg bg-muted/50">
          <h4 className="text-sm font-semibold mb-2">💡 为什么需要弹窗权限？</h4>
          <p className="text-xs text-muted-foreground">
            "一键打开全部标签页"功能需要同时打开多个网页。浏览器为了安全考虑，默认会拦截批量打开的弹窗。
            允许 TMarks 的弹窗权限后，您就可以一次性打开标签页组中的所有网页，大大提高工作效率。
          </p>
        </div>

        {/* 扩展权限列表 */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">扩展所需权限</h4>
          
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <Shield className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">书签访问权限</div>
              <div className="text-xs text-muted-foreground">
                允许扩展读取和保存浏览器书签
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <Shield className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">标签页访问权限</div>
              <div className="text-xs text-muted-foreground">
                允许扩展访问当前打开的标签页信息
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">存储权限</div>
              <div className="text-xs text-muted-foreground">
                允许扩展在本地存储数据
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border"></div>

      {/* 安装步骤 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">安装步骤</h3>
          <p className="text-sm text-muted-foreground mt-1">
            按照以下步骤安装浏览器扩展
          </p>
        </div>

        <div className="space-y-3">
          {[
            { step: 1, title: '下载插件压缩包', desc: '点击上方下载按钮，获取对应浏览器的扩展文件' },
            { step: 2, title: '解压文件', desc: '将下载的 zip 文件解压到任意文件夹（建议放在不会删除的位置）' },
            { step: 3, title: '打开扩展管理页面', desc: 'Chrome: chrome://extensions/ | Edge: edge://extensions/ | Firefox: about:debugging' },
            { step: 4, title: '启用开发者模式', desc: '在扩展管理页面右上角，打开"开发者模式"开关' },
            { step: 5, title: '加载插件', desc: '点击"加载已解压的扩展程序"，选择刚才解压的文件夹' },
            { step: 6, title: '完成安装', desc: '插件图标会出现在浏览器工具栏，点击即可使用' },
          ].map((item) => (
            <div key={item.step} className="flex gap-3 p-3 rounded-lg bg-muted/30">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">{item.step}</span>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium mb-1">{item.title}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border"></div>

      {/* 常见问题 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">常见问题</h3>
        </div>

        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-muted/30">
            <h4 className="text-sm font-medium mb-2">Q: 插件安装后找不到图标？</h4>
            <p className="text-xs text-muted-foreground">
              A: 点击浏览器工具栏右侧的拼图图标，找到 TMarks 插件并点击固定按钮，图标就会显示在工具栏上。
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/30">
            <h4 className="text-sm font-medium mb-2">Q: 如何获取 API Key？</h4>
            <p className="text-xs text-muted-foreground">
              A: 在通用设置的"API"标签页中创建一个新的 API Key 并复制到插件配置中。
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/30">
            <h4 className="text-sm font-medium mb-2">Q: 插件支持哪些浏览器？</h4>
            <p className="text-xs text-muted-foreground">
              A: 支持 Chrome、Edge、Firefox、Brave、Opera、360、QQ、搜狗等主流浏览器。
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/30">
            <h4 className="text-sm font-medium mb-2">Q: 保存的标签页组在哪里查看？</h4>
            <p className="text-xs text-muted-foreground">
              A: 在 TMarks 网站的"标签页"页面可以查看和管理所有保存的标签页组。
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-border"></div>

      {/* 提示信息 */}
      <InfoBox icon={Info} title="使用提示" variant="info">
        <ul className="space-y-1">
          <li>• 首次使用需要在插件中配置 TMarks 网站地址和 API Key</li>
          <li>• 建议将插件图标固定到工具栏，方便快速访问</li>
          <li>• 插件会自动保存标签页的标题、URL 和网站图标</li>
          <li>• 所有数据自动同步到云端，多设备无缝切换</li>
        </ul>
      </InfoBox>
    </div>
  )
}
