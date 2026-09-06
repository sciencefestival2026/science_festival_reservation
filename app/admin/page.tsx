'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Calendar, Clock, Trash2, CheckCircle2 } from 'lucide-react';

interface Entry {
  id: number;
  user_name: string;
  event_date: string;
  booth_name: string;
  time_slot: string;
  num_people: number;
  status: string;
  created_at: string;
}

export default function AdminPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // 予約データの取得
  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('draw_entries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('データ取得エラー:', error);
    } else {
      setEntries(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  // 予約削除処理
  const handleDelete = async (id: number) => {
    if (!confirm('この予約を取り消しますか？')) return;

    const { error } = await supabase
      .from('draw_entries')
      .delete()
      .eq('id', id);

    if (error) {
      alert('削除に失敗しました');
    } else {
      fetchEntries();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">予約管理ダッシュボード</h1>
            <p className="text-sm text-slate-500 mt-1">全 {entries.length} 件の予約一覧</p>
          </div>
          <button
            onClick={fetchEntries}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
          >
            データを更新
          </button>
        </div>

        {/* 予約一覧テーブル */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500">読み込み中...</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-slate-500">まだ予約データがありません。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-4">申込者名</th>
                    <th className="p-4">ブース名</th>
                    <th className="p-4">日程 / 時間帯</th>
                    <th className="p-4 text-center">人数</th>
                    <th className="p-4 text-center">状態</th>
                    <th className="p-4 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-900">{entry.user_name}</td>
                      <td className="p-4 font-semibold text-indigo-600">{entry.booth_name}</td>
                      <td className="p-4 space-y-1">
                        <div className="flex items-center gap-1 text-slate-700">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{entry.event_date}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{entry.time_slot}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {entry.num_people}名
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          {entry.status}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}