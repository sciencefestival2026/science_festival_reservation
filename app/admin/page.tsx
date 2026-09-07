'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface MasterSlot {
  id: number;
  event_date: string;
  booth_name: string;
  time_slot: string;
  capacity?: number;
}

interface Entry {
  id: number;
  user_name: string;
  event_date: string;
  booth_name: string;
  time_slot: string;
  num_people: number;
  status?: string;
  created_at: string;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'entries' | 'master'>('entries');
  
  const [entries, setEntries] = useState<Entry[]>([]);
  const [masters, setMasters] = useState<MasterSlot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // フォーム用ステート
  const [newEventDate, setNewEventDate] = useState('');
  const [newBoothName, setNewBoothName] = useState('');
  const [newTimeSlot, setNewTimeSlot] = useState('');
  const [newCapacity, setNewCapacity] = useState<number>(5);

  // 全データ取得
  const fetchData = async () => {
    setLoading(true);
    
    // 1. 予約エントリー取得
    const { data: entriesData, error: entriesErr } = await supabase
      .from('draw_entries')
      .select('*')
      .order('created_at', { ascending: false });

    if (entriesErr) {
      console.error('予約データの取得エラー:', entriesErr);
    } else {
      setEntries(entriesData || []);
    }

// マスターデータ取得（開催日 ➔ ブース名 ➔ 時間帯 で昇順ソート）
    const { data: masterData, error: masterErr } = await supabase
      .from('draw_master')
      .select('*')
      .order('event_date', { ascending: true })
      .order('booth_name', { ascending: true })
      .order('time_slot', { ascending: true });
    if (masterErr) {
      console.error('マスターデータの取得エラー:', masterErr);
    } else {
      // 開催日 ➔ ブース名 ➔ 時間帯（数値順）でソートしてセット
      const sortedMaster = (masterData || []).sort((a, b) => {
        // 1. 開催日で比較
        if (a.event_date !== b.event_date) {
          return a.event_date.localeCompare(b.event_date);
        }
        // 2. ブース名で比較
        if (a.booth_name !== b.booth_name) {
          return a.booth_name.localeCompare(b.booth_name, undefined, { numeric: true });
        }
        // 3. 時間帯で比較（9:00と10:00を正しく判定）
        return a.time_slot.localeCompare(b.time_slot, undefined, { numeric: true });
      });

      setMasters(sortedMaster);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 【マスター新規登録】
  const handleAddMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventDate || !newBoothName || !newTimeSlot) {
      alert('すべての必須項目を入力してください');
      return;
    }

    // 正しいカラム名 "capacity" で追加
    const { error } = await supabase.from('draw_master').insert([
      {
        event_date: newEventDate,
        booth_name: newBoothName,
        time_slot: newTimeSlot,
        capacity: Number(newCapacity),
      },
    ]);

    if (error) {
      console.error('Insert Error Detail:', error);
      alert(`【登録失敗】\nエラー内容: ${error.message}`);
    } else {
      alert('マスター枠を追加しました！');
      setNewBoothName('');
      setNewTimeSlot('');
      fetchData();
    }
  };

  // 【マスター削除】
  const handleDeleteMaster = async (id: number) => {
    if (!confirm('この枠を削除しますか？')) return;

    const { error } = await supabase.from('draw_master').delete().eq('id', id);
    if (error) {
      alert('削除失敗: ' + error.message);
    } else {
      fetchData();
    }
  };

  // 【予約削除】
  const handleDeleteEntry = async (id: number) => {
    if (!confirm('この予約を取り消しますか？')) return;

    const { error } = await supabase.from('draw_entries').delete().eq('id', id);
    if (error) {
      alert('削除失敗: ' + error.message);
    } else {
      fetchData();
    }
  };

  // 各枠の予約数を計算（draw_entriesのデータから集計）
  const getReservedCount = (event_date: string, booth_name: string, time_slot: string) => {
    return entries.filter(
      (entry) =>
        entry.event_date === event_date &&
        entry.booth_name === booth_name &&
        entry.time_slot === time_slot
    ).reduce((sum, entry) => sum + (entry.num_people || 1), 0);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-2xl font-bold">予約システム管理画面</h1>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-sm rounded transition"
        >
          🔄 最新情報に更新
        </button>
      </div>

      {/* タブ切り替え */}
      <div className="flex space-x-4 border-b">
        <button
          className={`py-2 px-4 font-semibold border-b-2 ${
            activeTab === 'entries'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('entries')}
        >
          📋 予約一覧 ({entries.length}件)
        </button>
        <button
          className={`py-2 px-4 font-semibold border-b-2 ${
            activeTab === 'master'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('master')}
        >
          ⚙️ マスター枠管理 ({masters.length}件)
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-8">データを読み込み中...</p>
      ) : (
        <>
          {/* ----- タブ1: 予約一覧 ----- */}
          {activeTab === 'entries' && (
            <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3">日時</th>
                    <th className="p-3">お名前</th>
                    <th className="p-3">ブース</th>
                    <th className="p-3">時間帯</th>
                    <th className="p-3">人数</th>
                    <th className="p-3">受付日時</th>
                    <th className="p-3 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-gray-500">
                        予約データはありません
                      </td>
                    </tr>
                  ) : (
                    entries.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="p-3">{item.event_date}</td>
                        <td className="p-3 font-semibold">{item.user_name}</td>
                        <td className="p-3">{item.booth_name}</td>
                        <td className="p-3">{item.time_slot}</td>
                        <td className="p-3">{item.num_people}名</td>
                        <td className="p-3 text-xs text-gray-500">
                          {item.created_at ? new Date(item.created_at).toLocaleString('ja-JP') : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteEntry(item.id)}
                            className="text-red-600 hover:text-red-800 text-xs px-2 py-1 border border-red-200 rounded hover:bg-red-50"
                          >
                            🗑️ 削除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ----- タブ2: マスター枠管理 ----- */}
          {activeTab === 'master' && (
            <div className="space-y-6">
              {/* 新規追加フォーム */}
              <form
                onSubmit={handleAddMaster}
                className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-4"
              >
                <h2 className="font-bold text-blue-900 text-sm">＋ 新しい枠を追加する</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">開催日</label>
                    <input
                      type="date"
                      value={newEventDate}
                      onChange={(e) => setNewEventDate(e.target.value)}
                      className="w-full p-2 border rounded text-sm bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">ブース名</label>
                    <input
                      type="text"
                      placeholder="例: Aブース"
                      value={newBoothName}
                      onChange={(e) => setNewBoothName(e.target.value)}
                      className="w-full p-2 border rounded text-sm bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">時間帯</label>
                    <input
                      type="text"
                      placeholder="例: 10:00-11:00"
                      value={newTimeSlot}
                      onChange={(e) => setNewTimeSlot(e.target.value)}
                      className="w-full p-2 border rounded text-sm bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">定員（名）</label>
                    <input
                      type="number"
                      min="1"
                      value={newCapacity}
                      onChange={(e) => setNewCapacity(Number(e.target.value))}
                      className="w-full p-2 border rounded text-sm bg-white"
                      required
                    />
                  </div>
                </div>
                <div className="text-right">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 transition"
                  >
                    枠を追加登録
                  </button>
                </div>
              </form>

              {/* マスターデータ一覧 */}
              <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3">開催日</th>
                      <th className="p-3">ブース名</th>
                      <th className="p-3">時間帯</th>
                      <th className="p-3">定員</th>
                      <th className="p-3">予約状況</th>
                      <th className="p-3 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {masters.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-gray-500">
                          枠データが登録されていません
                        </td>
                      </tr>
                    ) : (
                      masters.map((slot) => {
                        const cap = slot.capacity ?? 0;
                        const reserved = getReservedCount(slot.event_date, slot.booth_name, slot.time_slot);

                        return (
                          <tr key={slot.id} className="hover:bg-gray-50">
                            <td className="p-3">{slot.event_date}</td>
                            <td className="p-3 font-semibold">{slot.booth_name}</td>
                            <td className="p-3">{slot.time_slot}</td>
                            <td className="p-3">{cap}名</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                  reserved >= cap && cap > 0
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-green-100 text-green-700'
                                }`}
                              >
                                {reserved} / {cap} 名
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleDeleteMaster(slot.id)}
                                className="text-red-600 hover:text-red-800 text-xs px-2 py-1 border border-red-200 rounded hover:bg-red-50"
                              >
                                🗑️ 削除
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}