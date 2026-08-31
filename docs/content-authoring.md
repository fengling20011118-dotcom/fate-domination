# 新增御主与从者

重构版新增角色使用内容扩展包，不修改 `generated/legacy-content.json`，也不修改旧版 `Fate_Domination-开发版`。

## 推荐目录

```text
src/content/extensions/
  your-pack.json
assets/roles/
  masters/your-master.png
  servants/your-servant.png
  skills/your-skill.png
```

## 最小格式

```json
{
  "masters": [
    {
      "id": "master.example",
      "name": { "zh": "示例御主", "en": "Example Master" },
      "image": "assets/roles/masters/example-master.png",
      "initialMana": 4,
      "skills": [
        {
          "id": "master.example.skill.s1",
          "name": { "zh": "示例技能", "en": "Example Skill" },
          "image": "assets/roles/skills/example-skill.png",
          "text": { "zh": "卡面中文描述", "en": "English card text" },
          "activation": "phase",
          "windows": ["action"],
          "cost": 2,
          "requirement": 8,
          "handlerId": "master.example.skill.s1"
        }
      ]
    }
  ],
  "servants": [
    {
      "id": "servant.example",
      "name": { "zh": "示例从者", "en": "Example Servant" },
      "class": "Saber",
      "image": "assets/roles/servants/example-servant.png",
      "deck": ["card.attack.b1"],
      "skills": []
    }
  ],
  "cards": []
}
```

英文卡图保留在 `name.en` 和 `text.en`，中文译名只负责显示；规则处理器使用稳定的 `id`/`handlerId`，不会解析描述文本。

每项技能应填写 `sourceRefs` 数组，记录实际规则依据。初始御主和从者名单以只读的
`Fate_Domination-开发版` 当前内容为准，角色、牌库、技能和卡图必须通过稳定 ID 与所属关系建立映射。
开发版对应卡图是角色技能迁移的首选卡面依据；只有开发版缺图、文字无法辨认或归属无法确认时，
才使用 `npm run index:servants` 生成的 CHM 图鉴索引补充核对。CHM 的英文版/中文版目录不决定迁移名单，
也不得仅凭相似名称自动合并角色；证据不足的能力保持 `PARTIAL`。

从者牌库必须正好 12 张。技能卡的 8 点魔力门槛应写入 `requirement: 8`；明确标注“少于 8 点也可使用”的卡牌才写 `requirement: 0` 并在规则处理器中登记例外。
