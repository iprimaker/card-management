// Add command definitions here. Database operations must also be permitted by the RPC.
window.CARD_COMMANDS = {
 scopes: {all:'全シリーズ',aikatsu:'アイカツ',onegai:'おねがい',himitsu:'ひみつ','verse-onegai':'おねがいバース','verse-himitsu':'ひみつバース'},
 actions: {
 read:{label:'確認・お楽しみ（変更なし）',types:{summary:'収集サマリー',duplicates:'重複カードを確認',favorites:'お気に入り数を確認',trade:'譲・求の件数を確認',random:'今日のランダムカード',next:'次に集めるカードを抽選'}},
 reset:{label:'解除・リセット',rpc:'card_album_reset_records',types:{all:'所持・お気に入り・譲求',ownership:'所持記録',favorites:'お気に入り',trade:'譲・求',offer:'譲のみ',want:'求のみ'},warning:'元に戻せません。バースの共通パーツを削除すると、他のだんの収集状況にも反映されます。'},
 set:{label:'一括登録・設定',rpc:'card_album_set_records',types:{ownership:'持っているにする',parts:'バース全パーツを持っているにする',favorites:'お気に入りにする',offer:'譲にする',want:'求にする','priority-offer':'優先譲にする','priority-want':'優先求にする'},warning:'既存の所持数は減らさず、未所持を1枚にします。ownershipはバースのフルコーデだけ、partsはパーツだけを登録します。譲と求は入れ替わり、通常・優先も指定値に変更します。'}
 }
};
