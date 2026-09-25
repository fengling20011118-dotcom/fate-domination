Fate / Domination 音效投放与试听
================================

一、可直接使用的格式
--------------------
MP3、OGG、WAV 都能直接读取，不需要转换。
你现在有 MP3 就直接放进去。

短音效建议：
1. 开头空白尽量少于 10 毫秒。
2. 末尾保留自然衰减，不留长静音。
3. 峰值建议控制在 -1 dB 至 -3 dB。
4. 按钮约 0.05～0.25 秒；卡牌约 0.10～0.60 秒；洗牌可到 1.5 秒。

二、边玩边试听
--------------
1. 将音频放进下方对应目录，并按名称命名。
2. 刷新“ui-preview\本地UI预览.html”页面。
3. 在真实界面里划过、点击、选牌或出牌即可听到。
4. 换文件后再次刷新页面即可比较。
5. 同一动作可放 01～05 共 5 个版本，游戏会随机播放并避免连续重复。

当前已经接入真实操作的音效：
- 所有普通按钮的划过与点击
- 返回、关闭和分页
- 选人界面与图鉴的角色划过、选择和锁定
- 手牌划过、选中、取消选中
- 抽牌、打出卡牌、卡牌落桌
- 打开与关闭“御主与从者技能”
- 使用御主或从者技能
- 使用令咒；无效令咒操作会播放错误音

三、文件夹与命名
----------------

ui\
  ui-hover-01.mp3          普通按钮、菜单项目划过
  ui-click-01.mp3          普通按钮点击
  ui-confirm-01.mp3        声明页、启动页确认
  ui-back-01.mp3           返回、取消、关闭
  ui-error-01.mp3          操作无效
  ui-panel-open-01.mp3     打开技能面板
  ui-panel-close-01.mp3    关闭技能面板
  ui-tab-01.mp3            切换御主、从者或分页

cards\
  card-draw-01.mp3         抽牌
  card-pickup-01.mp3       鼠标划过手牌
  card-select-01.mp3       选中卡牌
  card-deselect-01.mp3     取消选中卡牌
  card-play-01.mp3         卡牌从手牌飞出
  card-land-01.mp3         卡牌落到桌面
  card-reveal-01.mp3       预留：卡牌翻开
  card-discard-01.mp3      预留：进入弃牌堆
  card-shuffle-01.mp3      预留：洗牌

characters\
  character-hover-01.mp3   选人和图鉴中的角色划过
  character-select-01.mp3  角色卡被选中
  character-lock-01.mp3    御主或从者最终锁定
  true-name-reveal-01.mp3  预留：从者真名解放

battle\
  command-seal-use-01.mp3  消耗令咒
  skill-use-01.mp3         使用御主或从者技能
  noble-phantasm-01.mp3    预留：宝具发动
  player-move-01.mp3       预留：常规移动
  player-deploy-01.mp3     预留：部署
  resource-gain-01.mp3     预留：获得魔力或战果
  phase-change-01.mp3      预留：阶段切换
  climax-start-01.mp3      预留：高潮阶段开始
  timer-warning-01.mp3     预留：时间警告
  battle-win-01.mp3        预留：战斗获胜
  battle-lose-01.mp3       预留：战斗失败

四、先试这 10 个
----------------
  ui\ui-hover-01.mp3
  ui\ui-click-01.mp3
  ui\ui-back-01.mp3
  cards\card-draw-01.mp3
  cards\card-pickup-01.mp3
  cards\card-select-01.mp3
  cards\card-play-01.mp3
  cards\card-land-01.mp3
  battle\command-seal-use-01.mp3
  characters\character-select-01.mp3
