# FDè§’è‰²æŠ€èƒ½é‡æ„ checkpoint

ä»»åŠ¡: tsk_ac9ff73f63226d5d

é˜¶æ®µ: custom resource rules-core æ¥å…¥å‡†å¤‡

å½“å‰ audit:
- FULL: 689/944
- PARTIAL: 255/944

æœ€å¤§ç¼ºå£:
- custom: 303
- lifecycle: 165
- condition: 157
- choice: 115
- target: 60

æœ¬è½®ä¿®æ”¹:
- src/rules-core/resources.ts
  - æ–°å¢ consumeCustomResource
- test/custom-resources.test.ts
  - å¢åŠ  consume æµ‹è¯•è¦†ç›–

æµ‹è¯•:
- compile:skill-programs: pending (next run)
- audit:skills: pending (next run)

ä¸‹ä¸€æ­¥:
ç»§ç»­å°† custom resource æ¥å…¥è§’è‰² handlerï¼Œä¼˜å…ˆæ‰¹é‡é—­åˆèµ„æºå‹æŠ€èƒ½ã€‚

×îĞÂÖ´ĞĞ¼ÇÂ¼:
- µ±Ç°½ÇÉ«: ¹«¹²»úÖÆ custom resource ½×¶Î
- ĞŞ¸ÄÎÄ¼ş: test/custom-resources.test.ts
- ĞÂÔö¸²¸Ç: ×ÊÔ´ÉÏÏŞ¡¢Ê§°Ü consume ²»¸Ä±ä×´Ì¬
- ²âÊÔ: npm.cmd test ÒÑÆô¶¯£¬×ÊÔ´²âÊÔÍ¨¹ı£»ÍêÕû²âÊÔÔÚ¼ÈÓĞÊ§°ÜÓÃÀı skill-authoring-batch-020 µ¼Èë´íÎó´¦³¬Ê±/Ê§°Ü
- FULL/PARTIAL: audit Î´±ä»¯£¬ÈÔ FULL 689/944 PARTIAL 255/944

## ×Ô¶¯ checkpoint 2026-09-11
- µ±Ç°½ÇÉ«/½×¶Î£º¹«¹²½Ó¿ÚĞŞ¸´ + PARTIAL ÅúÁ¿±ÕºÏ×¼±¸½×¶Î
- ĞŞ¸ÄÎÄ¼ş£ºsrc/rules-core/jekyll-hyde.ts
- ĞŞ¸ÄÄÚÈİ£º»Ö¸´ playerIgnoresDefeat ÃüÃûµ¼³ö£¬ĞŞ¸´ skill-authoring-batch-020 ½Ó¿ÚÈ±Ê§
- ×¨Ïî²âÊÔ£ºskill-authoring-batch-020.test.js ÔËĞĞÖĞ
- FULL/PARTIAL£ºFULL 689/944£¬PARTIAL 255/944
