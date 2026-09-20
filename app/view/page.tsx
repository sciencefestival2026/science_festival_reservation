'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Entry {
  id: number;
  user_name: string;
  event_date: string;
  booth_name: string;
  time_slot: string;
  num_people: number;
  status?: string;
  created_at?: string;
}

export default function StaffViewPage() {
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // フォーム入力用ステート
  const [inputDate, setInputDate] = useState<string>('');
  const [inputBooth, setInputBooth] = useState<string>('');
  const [inputTime, setInputTime] = useState<string>('');
  const [inputName, setInputName] = useState<string>('');

  // 絞り込み条件ステート（初期値は全件表示）
  const [searchParams, setSearchParams] = useState({
    date: '',
    booth: '',
    time: '',
    name: '',
  });

  // データ取得関数（1000件制限を自動分割で突破）
  const fetchData = async () => {
    setLoading(true);
    
    let fetchedData: Entry[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    try {
      // 1,000件ずつ繰り返し取得して1つの配列に合体
      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from('draw_entries')
          .select('*')
          .range(from, to)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('名簿取得エラー:', error);
          alert('データ取得エラー: ' + error.message);
          break;
        }

        if (data && data.length > 0) {
          fetchedData = [...fetchedData, ...(data as Entry[])];
          // 取得件数が1000件未満なら全件取り切ったと判定
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      console.log('【全件取得完了】合計件数:', fetchedData.length);

      // 日付 ＞ ブース ＞ 時間帯 の順でソート
      const sorted = fetchedData.sort((a, b) => {
        const dateA = a.event_date || '';
        const dateB = b.event_date || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);

        const boothA = a.booth_name || '';
        const boothB = b.booth_name || '';
        if (boothA !== boothB) return boothA.localeCompare(boothB, undefined, { numeric: true });

        const timeA = a.time_slot || '';
        const timeB = b.time_slot || '';
        return timeA.localeCompare(timeB, undefined, { numeric: true });
      });

      setAllEntries(sorted);
    } catch (err) {
      console.error('予期せぬエラー:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ドロップダウン用の選択肢生成（trim処理で表記揺れを防止）
  const dateOptions = Array.from(
    new Set(allEntries.map((item) => (item.event_date || '').trim()).filter(Boolean))
  ).sort();

  const boothOptions = Array.from(
    new Set(
      allEntries
        .filter((item) => !inputDate || (item.event_date || '').trim() === inputDate.trim())
        .map((item) => (item.booth_name || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const timeOptions = Array.from(
    new Set(
      allEntries
        .filter(
          (item) =>
            (!inputDate || (item.event_date || '').trim() === inputDate.trim()) &&
            (!inputBooth || (item.booth_name || '').trim() === inputBooth.trim())
        )
        .map((item) => (item.time_slot || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // 検索実行
  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearchParams({
      date: inputDate,
      booth: inputBooth,
      time: inputTime,
      name: inputName,
    });
  };

  // 条件リセット
  const handleClear = () => {
    setInputDate('');
    setInputBooth('');
    setInputTime('');
    setInputName('');
    setSearchParams({ date: '', booth: '', time: '', name: '' });
  };

  // 表記揺れ（スペースや空文字）を吸収した安全な絞り込み
  const displayedEntries = allEntries.filter((item) => {
    const cleanItemDate = (item.event_date || '').trim();
    const cleanItemBooth = (item.booth_name || '').trim();
    const cleanItemTime = (item.time_slot || '').trim();

    const cleanSearchDate = searchParams.date.trim();
    const cleanSearchBooth = searchParams.booth.trim();
    const cleanSearchTime = searchParams.time.trim();

    const matchDate = cleanSearchDate ? cleanItemDate === cleanSearchDate : true;
    const matchBooth = cleanSearchBooth ? cleanItemBooth === cleanSearchBooth : true;
    const matchTime = cleanSearchTime ? cleanItemTime === cleanSearchTime : true;
    const matchName = searchParams.name
      ? (item.user_name || '').toLowerCase().includes(searchParams.name.trim().toLowerCase())
      : true;

    return matchDate && matchBooth && matchTime && matchName;
  });

  const totalPeople = displayedEntries.reduce((sum, item) => sum + (item.num_people || 1), 0);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* 画面ヘッダー */}
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">当日受付・予約者名簿</h1>
          <p className="text-xs text-gray-500 mt-1">運営スタッフ専用コンソール</p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-sm rounded transition font-medium"
        >
          🔄 最新名簿に更新
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-8">最新の名簿データを全件読み込み中...</p>
      ) : (
        <div className="space-y-4">
          {/* 検索・絞り込みフィルター */}
          <form onSubmit={handleSearch} className="bg-gray-50 p-4 rounded-lg border flex flex-wrap gap-3 items-center">
            <span className="text-xs font-bold text-gray-700">🔍 名簿の絞り込み:</span>

            {/* 1. 開催日 */}
            <div>
              <select
                value={inputDate}
                onChange={(e) => {
                  setInputDate(e.target.value);
                  setInputBooth('');
                  setInputTime('');
                }}
                className="p-2 border rounded text-xs bg-white font-medium focus:outline-blue-500"
              >
                <option value="">すべての開催日</option>
                {dateOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* 2. ブース名 */}
            <div>
              <select
                value={inputBooth}
                onChange={(e) => {
                  setInputBooth(e.target.value);
                  setInputTime('');
                }}
                className="p-2 border rounded text-xs bg-white font-medium focus:outline-blue-500"
              >
                <option value="">すべてのブース</option>
                {boothOptions.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* 3. 時間帯 */}
            <div>
              <select
                value={inputTime}
                onChange={(e) => setInputTime(e.target.value)}
                className="p-2 border rounded text-xs bg-white font-medium focus:outline-blue-500"
              >
                <option value="">すべての時間帯</option>
                {timeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* 4. お名前検索 */}
            <div>
              <input
                type="text"
                placeholder="お名前（呼び出し名）..."
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                className="p-2 border rounded text-xs bg-white font-medium w-40 md:w-48 focus:outline-blue-500"
              />
            </div>

            {/* 検索実行ボタン */}
            <button
              type="submit"
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded transition shadow-sm"
            >
              検索
            </button>

            {/* クリアボタン */}
            {(searchParams.date || searchParams.booth || searchParams.time || searchParams.name || inputDate || inputBooth || inputTime || inputName) && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-gray-500 hover:text-gray-700 font-bold underline"
              >
                条件をリセット
              </button>
            )}
          </form>

          {/* 集計ステータス表示 */}
          <div className="flex justify-between items-center px-1">
            <span className="text-xs text-gray-500 font-medium">
              Supabase取得全件数: {allEntries.length} 件 / 画面表示: {displayedEntries.length} 件
            </span>
            <div className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md border border-blue-100">
              該当: <span className="text-base">{displayedEntries.length}</span> 組 / 合計人数: <span className="text-base">{totalPeople}</span> 名
            </div>
          </div>

          {/* データ一覧テーブル */}
          <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-3">お呼び出し名</th>
                  <th className="p-3">開催日</th>
                  <th className="p-3">ブース</th>
                  <th className="p-3">時間帯</th>
                  <th className="p-3 text-center">人数</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      該当する予約データはありません（全件数: {allEntries.length}件）
                    </td>
                  </tr>
                ) : (
                  displayedEntries.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition">
                      <td className="p-3 font-semibold text-gray-900">{item.user_name || '（名前なし）'}</td>
                      <td className="p-3 text-gray-600">{item.event_date || '-'}</td>
                      <td className="p-3 text-gray-600 font-medium">{item.booth_name || '-'}</td>
                      <td className="p-3 text-gray-600">{item.time_slot || '-'}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 font-bold rounded text-xs border border-blue-100">
                          {item.num_people || 1}名
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}