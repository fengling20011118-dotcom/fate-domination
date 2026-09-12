# FD 首批可玩内容包索引

状态：已编译、可创建五席正常测试局。规范包为 `data/packs/fd-playtest-v1/pack.json`；机器可读全集与逐实体证据位于 `data/generated/fd-playtest-v1.content-library.json` 和 `data/generated/fd-playtest-v1.evidence-report.json`。

证据顺序固定为原始牌图、HTM 关联、最终规则、OCR 草稿。本索引不以 OCR 补猜牌面内容。当前编译报告为 7 名御主、5 名从者、20 个事件槽、0 个阻塞问题；五套从者初始牌库共 60 张。

能力标记：`FULL` 表示该维度可由引擎确定执行；`PARTIAL` 表示只有列明维度自动处理；`HOST_ADJUDICATED` 表示保存已核对内容并请求房主裁定。

当前范围说明：巴贝奇和月之癌相关角色暂缓，不属于本次五席正常测试局；它们的历史草稿文件不作为当前内容包入口。

## 御主

| 御主 | 能力 | 御主技能（牌图） | 关联牌 | 概览牌图 |
|---|---|---|---|---|
| 丹·布拉克莫尔 `master.dan_blackmore` | `HOST_ADJUDICATED` | 五朔节骑士 `master.dan_blackmore.skill.may_day_knight`（`ScreenShot_2025-10-29_231122_183.png`） | — | `ScreenShot_2025-10-29_231113_375.png` |
| 尤里乌斯·贝尔奇斯科·哈维 `master.julius_harwey` | `HOST_ADJUDICATED` | 黑蝎 `master.julius_harwey.skill.black_scorpion`（`ScreenShot_2025-10-29_222541_772.png`） | — | `ScreenShot_2025-10-29_222531_412.png` |
| 肯尼斯·阿其波卢德 `master.kayneth_archibald` | `PARTIAL`；`skill_mana_eligibility` 为 `FULL` | 流体力学 `master.kayneth_archibald.skill.fluid_mechanics`（`ScreenShot_2025-10-29_163109_825.png`） | 月灵髓液 0/2、0/1、0/0（`163045_049`、`163051_633`、`163058_193`） | `ScreenShot_2025-10-29_163037_577.png` |
| 卫宫切嗣 `master.kiritsugu_emiya` | `HOST_ADJUDICATED` | 冷血杀手 `master.kiritsugu_emiya.skill.cold_blooded_killer`（`ScreenShot_2025-10-29_215437_375.png`） | 起源弹 `master.kiritsugu.origin_bullet`（`ScreenShot_2025-10-29_215428_559.png`） | `ScreenShot_2025-10-29_215423_544.png` |
| 久宇舞弥 `master.maiya_hisau` | `HOST_ADJUDICATED` | 援护射击、甜品狂热者（`ScreenShot_2025-10-29_230929_848.png`、`230941_863.png`） | — | `ScreenShot_2025-10-29_230925_200.png` |
| 间桐慎二 `master.matou_shinji` | `HOST_ADJUDICATED` | 圣杯核心 `master.matou_shinji.skill.holy_grail_core`（`ScreenShot_2025-10-30_194556_480.png`） | 伪臣之书“不在场/在场”（`194540_736.png`、`194545_992.png`） | `ScreenShot_2025-10-30_194536_066.png` |
| 卧藤门司 `master.monji_gatou` | `HOST_ADJUDICATED` | 豪快战意 `master.monji_gatou.skill.bold_fighting_spirit`（`ScreenShot_2025-10-29_222929_556.png`） | — | `ScreenShot_2025-10-29_222919_276.png` |

七名御主的初始魔力均为 4。令咒组件也存在于编译库中；其逐牌图片路径由证据报告列出。

## 从者与 12 张初始牌库

牌库写法为“属性:牌面值×张数”；具名牌直接写 ID。四属性计数顺序为力量/敏捷/魔术/特殊。

| 从者 | 能力与技能（牌图） | 初始牌库；属性计数 | 关联牌 | 概览牌图 |
|---|---|---|---|---|
| 弗朗西斯·德雷克 `servant.francis_drake` | `HOST_ADJUDICATED`；骑乘、黄金鹿与暴风夜、暴风雨的航海家（`192738_090`、`164710_406`、`164715_253`） | 力量:2×1,3×2；敏捷:2×1,3×2,4×1,5×1；`basic.luck`×1；`basic.surveil`×3；**3/5/0/4** | — | `ScreenShot_2025-11-01_164705_550.png` |
| 伽拉忒亚 `servant.galatea` | `HOST_ADJUDICATED`；皮格马利翁之爱、阿佛洛狄忒的恩惠、雕刻理想的王之凿（`113733_051`、`113744_227`、`113738_139`） | 力量:2×1,3×2,4×2；敏捷:2×1,3×1；魔术:2×2,4×1；`basic.preparation`×2；**5/2/3/2** | 花朵、飞鸟、祝福、生命（`113808_834`、`113803_708`、`113756_322`、`113749_410`） | `ScreenShot_2025-11-02_113727_595.png` |
| 亨利·杰基尔博士 `servant.henry_jekyll` | `HOST_ADJUDICATED`；隐秘的罪之游戏（被动/攻击）、气息遮断（`213243_870`、`213238_455`、`213248_495`） | 力量:2×1,3×1,5×1,7×1；敏捷:2×1,4×2,5×1,7×1,9×1；`basic.surveil`×1；`basic.preparation`×1；**4/6/0/2** | 狂战士力量3、敏捷3、敏捷5（共同来源 `ScreenShot_2025-11-01_213407_206.png`） | `ScreenShot_2025-11-01_213232_943.png` |
| 荆轲 `servant.jing_ke` | `HOST_ADJUDICATED`；易水歌、不归匕首、残虹（`215639_269`、`215649_229`、`215643_884`） | 力量:2×2,3×1,4×2；敏捷:2×2,3×1,4×1,5×2；`basic.surveil`×1；**5/6/0/1** | — | `ScreenShot_2025-11-01_215633_893.png` |
| 铃鹿御前 `servant.suzuka_gozen` | `HOST_ADJUDICATED`；才智的祝福、天鬼雨、三千大千世界（`213243_197`、`213247_716`、`213238_852`） | 力量:2×2,3×1,4×1；敏捷:2×1,3×2,4×2；魔术:2×1；`basic.surveil`×1；`basic.preparation`×1；**4/5/1/2** | — | `ScreenShot_2025-10-31_213233_669.png` |

基础字典：`basic.preparation`=远隔操作（特殊）、`basic.surveil`=疾行（特殊）、`basic.luck`=幸运（特殊）。

## 盈月之仪事件组

事件组 `event-set.waxing_moon_ritual` 有 20 个事件槽、18 张唯一事件牌。其中 `event.waxing_moon_ritual.ritual` 与 `event.waxing_moon_ritual.vengeful_spirit_barrier` 各出现 2 次；其余各出现 1 次。

| 事件 | 奖励 | 能力 | 牌图 |
|---|---:|---|---|
| 盈月之仪 `event.waxing_moon_ritual.ritual` | 4 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211319_640.png` |
| 抵御 `event.waxing_moon_ritual.resistance` | 4 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211237_713.png` |
| 暗流涌动 `event.waxing_moon_ritual.dark_current` | 3 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211201_975.png` |
| 怅然若失 `event.waxing_moon_ritual.sudden_loss` | 3 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211207_992.png` |
| 残阳如血 `event.waxing_moon_ritual.bloody_sunset` | 3 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211243_871.png` |
| 酒宴 `event.waxing_moon_ritual.banquet` | 3 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211256_615.png` |
| 怒发天升 `event.waxing_moon_ritual.rage_rising` | 3 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211232_480.png` |
| 祸神 `event.waxing_moon_ritual.curse_god` | 3 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211331_063.png` |
| 白夜行 `event.waxing_moon_ritual.white_night_walk` | 3 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211313_495.png` |
| 江户 `event.waxing_moon_ritual.edo` | 2 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211213_982.png` |
| 横须贺 `event.waxing_moon_ritual.yokosuka` | 2 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211302_297.png` |
| 赤坂 `event.waxing_moon_ritual.akasaka` | 2 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211337_375.png` |
| 怨灵结界 `event.waxing_moon_ritual.vengeful_spirit_barrier` | 2 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211226_007.png` |
| 美丽之物 `event.waxing_moon_ritual.beautiful_thing` | 2 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211153_351.png` |
| 狭路相逢 `event.waxing_moon_ritual.narrow_path_encounter` | 2 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211307_792.png` |
| 温柔乡 `event.waxing_moon_ritual.gentle_hometown` | 2 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211249_872.png` |
| 成长 `event.waxing_moon_ritual.growth` | 2 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211325_207.png` |
| 庆安神前比武 `event.waxing_moon_ritual.keian_ceremony` | 1 | `HOST_ADJUDICATED` | `chm-extract/图包/ScreenShot_2025-10-27_211220_295.png` |

所有事件牌均保留 `printedText`、`timing`、`interactions`、`effects`、`applicableLocations` 与原始牌图来源；具体执行仍依能力标记进入房主裁定或后续引擎原语实现。

## 已知裁定边界

- 肯尼斯仅对“魔力少于 8 点仍可使用技能”的费用资格维度提供 `FULL` 局部覆盖；额外牌库抽取与部署仍需房主裁定。
- 生成牌/替换牌生命周期、跨玩家响应、多段技能、按位置或历史移动条件结算的能力尚未全部映射为引擎原语。
- 盈月之仪事件组的牌面文字已按原始牌图结构化，但大多数分支效果仍处于 `HOST_ADJUDICATED`，不能由客户端自行判断合法性。
- UI 中代表性的“第 4 回合局势”和“新都地利”明确显示“规则说明待录入”，不作为内容包中的已确认卡牌文字。
- 禁止按 OCR 或常规桌游习惯静默补猜；不确定的牌面文字、属性、归属或效果必须记录并请求用户确认。
