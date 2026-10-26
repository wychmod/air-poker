export function englishEntry(html) {
  return html
    .replace('<html lang="zh-CN">', '<html lang="en">')
    .replaceAll('空气扑克 · 下一口空气', 'Air Poker · Your Next Breath')
    .replaceAll(
      '数字构牌，隐藏信息，空气博弈。免费单人浏览器游戏，改编自迫稔雄《噬谎者》第 40–43 卷「空气扑克」篇。',
      'Build a five-card hand. Read the risk. Bet your air. A free single-player browser game based on Toshio Sako’s USOGUI, volumes 40–43.',
    )
    .replaceAll(
      'https://wychmod.github.io/air-poker/assets/share/cover-zh.png',
      'https://wychmod.github.io/air-poker/assets/share/cover-en.png',
    )
    .replaceAll(
      '空气扑克：你下注的，是下一口空气。',
      'Air Poker: Your next breath is on the table.',
    )
    .replace('property="og:locale" content="zh_CN"', 'property="og:locale" content="en_US"')
    .replace(
      'property="og:locale:alternate" content="en_US"',
      'property="og:locale:alternate" content="zh_CN"',
    )
    .replace(
      'rel="canonical" href="https://wychmod.github.io/air-poker/"',
      'rel="canonical" href="https://wychmod.github.io/air-poker/en.html"',
    )
    .replace(
      'property="og:url" content="https://wychmod.github.io/air-poker/"',
      'property="og:url" content="https://wychmod.github.io/air-poker/en.html"',
    );
}
