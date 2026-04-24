// Built-in seed: 44 statutes most relevant to the 6 Japanese licensed professions
// (lawyer / CPA / tax advisor / labor & social-security attorney / judicial scrivener / administrative scrivener).
// Used by `laws-jp seed` to populate the initial watchlist.

module.exports = [
  // 横断
  { title: '民法', tags: ['民事', '弁護士', '司法書士'] },
  { title: '商法', tags: ['商事', '弁護士', '司法書士', '行政書士'] },
  { title: '会社法', tags: ['会社', '弁護士', '会計士', '司法書士'] },
  { title: '刑法', tags: ['刑事', '弁護士'] },
  { title: '刑事訴訟法', tags: ['刑事', '弁護士'] },
  { title: '民事訴訟法', tags: ['民事', '弁護士'] },
  { title: '個人情報の保護に関する法律', tags: ['情報', '弁護士', '行政書士'] },
  { title: '著作権法', tags: ['知財', '弁護士'] },
  { title: '借地借家法', tags: ['不動産', '弁護士', '司法書士'] },
  // 会計
  { title: '金融商品取引法', tags: ['金融', '会計士', '弁護士'] },
  { title: '公認会計士法', tags: ['会計士'] },
  // 税務
  { title: '法人税法', tags: ['税務', '税理士'] },
  { title: '所得税法', tags: ['税務', '税理士'] },
  { title: '消費税法', tags: ['税務', '税理士'] },
  { title: '相続税法', tags: ['税務', '税理士'] },
  { title: '国税通則法', tags: ['税務', '税理士'] },
  { title: '電子計算機を使用して作成する国税関係帳簿書類の保存方法等の特例に関する法律', tags: ['税務', '税理士'] },
  { title: '租税特別措置法', tags: ['税務', '税理士'] },
  { title: '地方税法', tags: ['税務', '税理士'] },
  // 労務
  { title: '労働基準法', tags: ['労務', '社労士', '弁護士'] },
  { title: '労働契約法', tags: ['労務', '社労士'] },
  { title: '労働者派遣事業の適正な運営の確保及び派遣労働者の保護等に関する法律', tags: ['労務', '社労士'] },
  { title: '雇用保険法', tags: ['労務', '社労士'] },
  { title: '健康保険法', tags: ['労務', '社労士'] },
  { title: '厚生年金保険法', tags: ['労務', '社労士'] },
  { title: '育児休業、介護休業等育児又は家族介護を行う労働者の福祉に関する法律', tags: ['労務', '社労士'] },
  { title: '高年齢者等の雇用の安定等に関する法律', tags: ['労務', '社労士'] },
  { title: '労働安全衛生法', tags: ['労務', '社労士'] },
  { title: '最低賃金法', tags: ['労務', '社労士'] },
  { title: '労働施策の総合的な推進並びに労働者の雇用の安定及び職業生活の充実等に関する法律', tags: ['労務', '社労士'] },
  // 登記
  { title: '不動産登記法', tags: ['登記', '司法書士'] },
  { title: '商業登記法', tags: ['登記', '司法書士'] },
  { title: '信託法', tags: ['信託', '司法書士', '弁護士'] },
  { title: '司法書士法', tags: ['司法書士'] },
  // 許認可・行政
  { title: '出入国管理及び難民認定法', tags: ['入管', '行政書士', '弁護士'] },
  { title: '建設業法', tags: ['建設', '行政書士'] },
  { title: '廃棄物の処理及び清掃に関する法律', tags: ['環境', '行政書士'] },
  { title: '道路運送法', tags: ['運送', '行政書士'] },
  { title: '貨物自動車運送事業法', tags: ['運送', '行政書士'] },
  { title: '古物営業法', tags: ['許認可', '行政書士'] },
  { title: '食品衛生法', tags: ['食品', '行政書士'] },
  { title: '農地法', tags: ['農業', '行政書士'] },
  { title: '行政手続法', tags: ['行政', '行政書士'] },
  { title: '行政不服審査法', tags: ['行政', '行政書士'] },
];
