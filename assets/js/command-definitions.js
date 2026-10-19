// Add command definitions here. Database operations must also be permitted by the RPC.
window.CARD_COMMANDS = {
  scopes: {
    all: "全シリーズ",
    aikatsu: "アイカツ",
    onegai: "おねがい",
    himitsu: "ひみつ",
    "verse-onegai": "おねがいバース",
    "verse-himitsu": "ひみつバース",
  },
  actions: {
    read: {
      label: "確認・お楽しみ（変更なし）",
      types: {
        summary: "収集サマリー",
        duplicates: "重複カードを確認",
        favorites: "お気に入り数を確認",
        trade: "譲・求の件数を確認",
        random: "今日のランダムカード",
        next: "次に集めるカードを抽選",
      },
    },
    reset: {
      label: "解除・リセット",
      rpc: "card_album_reset_records",
      types: {
        all: "所持・お気に入り・譲求",
        ownership: "所持記録",
        favorites: "お気に入り",
        trade: "譲・求",
        offer: "譲のみ",
        want: "求のみ",
      },
      warning:
        "元に戻せません。バースの共通パーツを削除すると、他のだんの収集状況にも反映されます。",
    },
    set: {
      label: "一括登録・設定",
      rpc: "card_album_set_records",
      types: {
        ownership: "持っているにする",
        parts: "バース全パーツを持っているにする",
        favorites: "お気に入りにする",
        offer: "譲にする",
        want: "求にする",
        "priority-offer": "優先譲にする",
        "priority-want": "優先求にする",
      },
      warning:
        "既存の所持数は減らさず、未所持を1枚にします。ownershipはバースのフルコーデだけ、partsはパーツだけを登録します。譲と求は入れ替わり、通常・優先も指定値に変更します。",
    },
  },
};

// Public command tokens are independent of database names and UI headings.
window.CARD_COMMANDS.codes = {
  actions: { read: "A01", set: "A02", reset: "A03", check: "A04" },
  scopes: {
    all: "T00",
    aikatsu: "T01",
    onegai: "T02",
    himitsu: "T03",
    "verse-onegai": "T04",
    "verse-himitsu": "T05",
  },
  types: {
    all: "D00",
    ownership: "D01",
    parts: "D02",
    favorites: "D03",
    trade: "D04",
    offer: "D05",
    want: "D06",
    "priority-offer": "D07",
    "priority-want": "D08",
    summary: "D09",
    duplicates: "D10",
    random: "D11",
    next: "D12",
  },
};
window.CARD_COMMANDS.help = {
  set: {
    ownership:
      "未所持のカード・フルコーデを1枚として登録します。すでに1枚以上あるものの枚数は変えません。バースのパーツ数は変更しません。",
    parts:
      "対象のバース構成パーツを未所持なら1枚として登録します。フルコーデの枚数は変更しません。共通パーツは他のだんにも反映されます。",
    favorites: "対象をお気に入りに追加します。所持数・譲求は変更しません。",
    offer:
      "対象を通常の譲に設定します。求の設定は解除され、優先指定も通常になります。所持数は変更しません。",
    want: "対象を通常の求に設定します。譲の設定は解除され、優先指定も通常になります。所持数は変更しません。",
    "priority-offer":
      "対象を優先の譲に設定します。求の設定は解除されます。所持数は変更しません。",
    "priority-want":
      "対象を優先の求に設定します。譲の設定は解除されます。所持数は変更しません。",
  },
  reset: {
    all: "対象の所持記録・お気に入り・譲求をまとめて削除します。アカウントやカード情報は残ります。元に戻せません。",
    ownership:
      "対象の所持記録を削除して0枚にします。お気に入りと譲求は残ります。バースはフルコーデと構成パーツが対象です。",
    favorites: "対象のお気に入りだけを解除します。所持数と譲求は残ります。",
    trade: "対象の譲・求と優先指定を解除します。所持数とお気に入りは残ります。",
    offer:
      "対象の譲と優先譲だけを解除します。求・所持数・お気に入りは残ります。",
    want: "対象の求と優先求だけを解除します。譲・所持数・お気に入りは残ります。",
  },
  read: {
    summary:
      "対象の種類数・直接所持登録の種類数・合計枚数を確認します。バースはパーツからの収集判定を含みません。記録は変更しません。",
    duplicates:
      "2枚以上登録している種類数と、2枚目以降の合計枚数を確認します。バースはフルコーデの直接所持のみです。",
    favorites: "対象のお気に入り登録数を確認します。記録は変更しません。",
    trade:
      "対象の譲・求・優先指定の件数を確認します。バースはフルコーデのみです。記録は変更しません。",
    random:
      "対象の中からランダムに1件を表示します。所持やお気に入りへの登録は行いません。",
    next: "直接所持登録がないカード・フルコーデからランダムに収集候補を表示します。バースのパーツによる完成判定は含みません。",
  },
};
