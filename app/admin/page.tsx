'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';

interface Entry {
  id: number;
  user_name: string;
  event_date: string;
  booth_name: string;
  time_slot: string;
  num_people: number;
  status: string;
  created_at?: string;
}

interface MasterSlot {
  id: number;
  booth_name: string;
  event_date: string;
  time_slot: string;
  capacity: number;
}

export default function AdminPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [masterSlots, setMasterSlots] = useState<MasterSlot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async () => {
    setLoading(true);
    const { data: masterData } = await supabase.from('draw_master').select('*');
    const { data: entryData } = await supabase.from('draw_entries').select('*').order('created_at', { ascending: true });

    if (masterData) setMasterSlots(masterData as MasterSlot[]);
    if (entryData) setEntries(entryData as Entry[]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // 総予約人数と予約件数の計算
  const validEntries = entries.filter(e => e.status === '予約確定' || e.status === '当選');
  const totalReservedPeople = validEntries.reduce((sum, e) => sum + e.num_people, 0);

  // Excel出力機能
  const downloadExcel = () => {
    if (validEntries.length === 0) {
      alert('予約データがありません。');
      return;
    }

    const sortedEntries = [...validEntries].sort((a, b) => {
      if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date);
      if (a.booth_name !== b.booth_name) return a.booth_name.localeCompare(b.booth_name);
      return a.time_slot.localeCompare(b.time_slot);
    });

    const excelData = sortedEntries.map(item => ({
      'お呼び出し名': item.user_name,
      '開催日': item.event_date,
      '対象ブース': item.booth_name,
      '予約時間枠': item.time_slot,
      '参加人数': item.num_people,
      'ステータス': '予約確定'
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '当日受付名簿');
    XLSX.writeFile(workbook, 'フェスティバル当日受付名簿.xlsx');
  };

  if (loading) return <div className="p-6 text-center text-gray-500 font-bold">管理データを読み込み中...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-800">⚙️ 先着予約 管理ダッシュボード</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={downloadExcel}
            className="flex-1 sm:flex-none px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition"
          >
            📊 予約名簿をExcel出力
          </button>
        </div>
      </div>

      {/* サマリー表示 */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-center font-bold text-sm">
        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-lg">
          総予約件数: {validEntries.length} 件
        </div>
        <div className="bg-green-50 border border-green-200 text-green-800 p-3 rounded-lg">
          総予約人数: {totalReservedPeople} 名
        </div>
      </div>

      {/* 予約者一覧テーブル */}
      <div className="bg-white rounded-xl shadow border overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-3 font-bold text-gray-600">お呼び出し名</th>
              <th className="p-3 font-bold text-gray-600">希望日</th>
              <th className="p-3 font-bold text-gray-600">ブース</th>
              <th className="p-3 font-bold text-gray-600">時間枠</th>
              <th className="p-3 font-bold text-gray-600">人数</th>
              <th className="p-3 font-bold text-gray-600">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-gray-400 italic">まだ予約データはありません。</td></tr>
            ) : (
              entries.map(entry => (
                <tr key={entry.id} className="border-b hover:bg-gray-50 transition">
                  <td className="p-3 font-bold">{entry.user_name}</td>
                  <td className="p-3 text-gray-600">{entry.event_date}</td>
                  <td className="p-3 text-gray-600">{entry.booth_name}</td>
                  <td className="p-3 text-gray-600">{entry.time_slot}</td>
                  <td className="p-3 font-bold text-gray-700">{entry.num_people}名</td>
                  <td className="p-3">
                    {(entry.status === '予約確定' || entry.status === '当選') && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 font-bold rounded text-xs">予約確定</span>
                    )}
                    {entry.status === 'キャンセル' && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs">キャンセル</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}