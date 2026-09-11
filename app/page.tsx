'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface MasterSlot {
  id: number;
  event_date: string;
  booth_name: string;
  time_slot: string;
  capacity?: number;
  booking_start_at?: string;
}

interface Entry {
  id: number;
  event_date: string;
  booth_name: string;
  time_slot: string;
  num_people: number;
}

export default function UserBookingPage() {
  const [masters, setMasters] = useState<MasterSlot[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // フォーム入力値
  const [agree, setAgree] = useState(false);
  const [userName, setUserName] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedBooth, setSelectedBooth] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [numPeople, setNumPeople] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedData, setCompletedData] = useState<any>(null);

  // データ取得
  const fetchData = async () => {
    setLoading(true);
    
    // マスター取得
    const { data: masterData } = await supabase
      .from('draw_master')
      .select('*')
      .order('event_date', { ascending: true })
      .order('booth_name', { ascending: true })
      .order('time_slot', { ascending: true });

    if (masterData) {
      const sortedMaster = masterData.sort((a, b) => {
        if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date);
        if (a.booth_name !== b.booth_name) return a.booth_name.localeCompare(b.booth_name, undefined, { numeric: true });
        return a.time_slot.localeCompare(b.time_slot, undefined, { numeric: true });
      });
      setMasters(sortedMaster);
    }

    // 予約済みデータ取得
    const { data: entryData } = await supabase.from('draw_entries').select('*');
    if (entryData) setEntries(entryData);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 予約開始前かどうかを判定する関数
  const isBeforeBookingStart = (bookingStartAt?: string) => {
    if (!bookingStartAt) return false;
    const now = new Date();
    const startTime = new Date(bookingStartAt);
    return now < startTime;
  };

  // 5分前締め切りチェック関数
  const isSlotExpired = (eventDateStr: string, timeSlotStr: string) => {
    try {
      const startTimeStr = timeSlotStr.split('-')[0].trim();
      const slotDateTimeStr = `${eventDateStr}T${startTimeStr}:00`;
      const slotStartTime = new Date(slotDateTimeStr);
      const cutoffTime = new Date(slotStartTime.getTime() - 5 * 60 * 1000);
      return new Date() >= cutoffTime;
    } catch (e) {
      return false;
    }
  };

  // 選択可能な日付・ブース・時間帯の抽出
  const availableDates = Array.from(new Set(masters.map((m) => m.event_date))).sort();

  const availableBooths = selectedDate
    ? Array.from(
        new Set(masters.filter((m) => m.event_date === selectedDate).map((m) => m.booth_name))
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];

  const availableSlots = selectedDate && selectedBooth
    ? masters.filter((m) => m.event_date === selectedDate && m.booth_name === selectedBooth)
    : [];

  // 各枠の予約数を計算
  const getReservedCount = (date: string, booth: string, time: string) => {
    return entries
      .filter((e) => e.event_date === date && e.booth_name === booth && e.time_slot === time)
      .reduce((sum, e) => sum + (e.num_people || 1), 0);
  };

  // 選択中の枠の「残席数」を計算
  const currentSlot = masters.find(
    (m) => m.event_date === selectedDate && m.booth_name === selectedBooth && m.time_slot === selectedTime
  );
  const currentRemaining = currentSlot
    ? Math.max(0, (currentSlot.capacity ?? 0) - getReservedCount(selectedDate, selectedBooth, selectedTime))
    : 20;

  // 動的な人数選択肢の生成（最大20名または残席数まで）
  const maxSelectablePeople = selectedTime ? Math.min(20, currentRemaining) : 20;
  const peopleOptions = Array.from({ length: maxSelectablePeople }, (_, i) => i + 1);

  // 選択時間が変わった際に人数オーバーを防止する処理
  useEffect(() => {
    if (selectedTime && numPeople > maxSelectablePeople) {
      setNumPeople(maxSelectablePeople > 0 ? maxSelectablePeople : 1);
    }
  }, [selectedTime, maxSelectablePeople, numPeople]);

  // 予約送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agree) return alert('注意事項をご確認いただき、同意のチェックを入れてください');
    if (!userName.trim()) return alert('お呼び出し名（お名前）を入力してください');
    if (!selectedDate || !selectedBooth || !selectedTime) return alert('希望日、希望ブース、希望時間帯をすべて選択してください');

    const slot = masters.find(
      (m) => m.event_date === selectedDate && m.booth_name === selectedBooth && m.time_slot === selectedTime
    );

    if (!slot) return alert('選択された枠が見つかりません');

    // 予約開始前チェック
    if (isBeforeBookingStart(slot.booking_start_at)) {
      const formattedStart = new Date(slot.booking_start_at!).toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return alert(`この枠は【${formattedStart}】から受付開始となります。`);
    }

    // 5分前締め切りチェック
    if (isSlotExpired(selectedDate, selectedTime)) {
      return alert('申し訳ありません。この枠は開始5分前を過ぎたため受付を終了しました。');
    }

    // 残席チェック
    const capacity = slot.capacity ?? 0;
    const currentCount = getReservedCount(selectedDate, selectedBooth, selectedTime);
    if (currentCount + numPeople > capacity) {
      return alert(`申し訳ありません。残席（${capacity - currentCount}名分）を超える人数のため予約を確定できません。`);
    }

    setIsSubmitting(true);

    const { data, error } = await supabase
      .from('draw_entries')
      .insert([
        {
          user_name: userName.trim(),
          event_date: selectedDate,
          booth_name: selectedBooth,
          time_slot: selectedTime,
          num_people: numPeople,
        },
      ])
      .select();

    setIsSubmitting(false);

    if (error) {
      alert('予約の登録に失敗しました: ' + error.message);
    } else {
      setCompletedData(data[0]);
    }
  };

  if (completedData) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white shadow-lg rounded-xl mt-8 space-y-6 text-center border">
        <h2 className="text-2xl font-bold text-green-600">🎉 予約が確定しました</h2>
        <p className="text-sm text-gray-600">以下の画面を**スクリーンショット**して大切に保管してください。</p>

        <div className="bg-gray-50 p-4 rounded-lg border text-left space-y-2 text-sm">
          <p className="font-bold text-gray-800 border-b pb-2 text-center">◆ 予約内容の控え ◆</p>
          <p><strong>お名前:</strong> {completedData.user_name} 様</p>
          <p><strong>希望日:</strong> {completedData.event_date}</p>
          <p><strong>ブース:</strong> {completedData.booth_name}</p>
          <p><strong>時間帯:</strong> {completedData.time_slot}</p>
          <p><strong>人数:</strong> {completedData.num_people}名</p>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition"
        >
          トップ画面へ戻る
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white shadow-md rounded-xl space-y-6 my-6 border">
      <h1 className="text-xl font-bold text-center border-b pb-3">ブース先着予約システム</h1>

      {/* 詳細な注意事項（最初はこれのみを表示） */}
      <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-xs space-y-2 text-amber-900">
        <p className="font-bold text-sm border-b border-amber-200 pb-1">【ご予約に関する重要注意事項】</p>
        <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
          <li><strong>受付締め切り：</strong>各時間帯の【開始5分前】にシステム上にて自動的に受付を締め切ります。</li>
          <li><strong>予約確定後の変更・取り消し：</strong>予約確定後のキャンセルや日時の変更はお受けできません。十分ご確認のうえご応募ください。</li>
          <li><strong>先着順の確定：</strong>残席管理はリアルタイムで行っております。ボタンを押したタイミングによって満席となり、予約が完了しない場合がございます。</li>
          <li><strong>受付時のご案内：</strong>当日はご案内のお呼び出し名（お名前）を確認させていただきます。お時間に遅れずにお越しください。</li>
        </ul>
        <div className="pt-2 border-t border-amber-200 mt-2">
          <label className="flex items-center space-x-2 cursor-pointer font-bold text-sm text-gray-900">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span>上記の重要注意事項を確認し、同意します</span>
          </label>
        </div>
      </div>

      {/* 注意事項にチェックが入った場合のみ、入力フォームを表示 */}
      {agree && (
        <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t">
          {/* お名前 */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              お呼び出し名（お名前）<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="例: 山田 太郎"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          {/* 1. 希望日 */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              1. 希望日を選択<span className="text-red-500">*</span>
            </label>
            <select
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedBooth('');
                setSelectedTime('');
              }}
              className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white"
              required
            >
              <option value="">希望日を選択してください</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* 2. 希望ブース */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              2. 希望ブースを選択<span className="text-red-500">*</span>
            </label>
            <select
              value={selectedBooth}
              onChange={(e) => {
                setSelectedBooth(e.target.value);
                setSelectedTime('');
              }}
              disabled={!selectedDate}
              className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white disabled:bg-gray-100"
              required
            >
              <option value="">希望ブースを選択してください</option>
              {availableBooths.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* 3. 希望時間帯 */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              3. 希望時間帯を選択<span className="text-red-500">*</span>
            </label>
            <select
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              disabled={!selectedBooth}
              className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white disabled:bg-gray-100"
              required
            >
              <option value="">時間帯を選択してください</option>
              {availableSlots.map((slot) => {
                const capacity = slot.capacity ?? 0;
                const reserved = getReservedCount(slot.event_date, slot.booth_name, slot.time_slot);
                const remaining = Math.max(0, capacity - reserved);

                const isExpired = isSlotExpired(slot.event_date, slot.time_slot);
                const isNotStarted = isBeforeBookingStart(slot.booking_start_at);
                const isFull = remaining === 0;

                let startLabel = '';
                if (isNotStarted && slot.booking_start_at) {
                  const dt = new Date(slot.booking_start_at);
                  startLabel = `【${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}〜受付開始】`;
                }

                const isDisabled = isExpired || isFull || isNotStarted;

                return (
                  <option
                    key={slot.id}
                    value={slot.time_slot}
                    disabled={isDisabled}
                    className={
                      isNotStarted
                        ? 'bg-gray-500 text-white font-bold'
                        : isExpired || isFull
                        ? 'bg-gray-100 text-gray-400'
                        : 'text-gray-900'
                    }
                  >
                    {slot.time_slot}{' '}
                    {isNotStarted
                      ? startLabel
                      : isExpired
                      ? '（受付終了）'
                      : isFull
                      ? '（満席）'
                      : `（残り ${remaining} 枠）`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 4. 希望人数（「〇名」のみのすっきりした表示） */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              4. 希望人数<span className="text-red-500">*</span>
            </label>
            <select
              value={numPeople}
              onChange={(e) => setNumPeople(Number(e.target.value))}
              disabled={peopleOptions.length === 0}
              className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white disabled:bg-gray-100"
            >
              {peopleOptions.length === 0 ? (
                <option value="0">満席のため選択できません</option>
              ) : (
                peopleOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}名
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || peopleOptions.length === 0}
            className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition shadow"
          >
            {isSubmitting ? '処理中...' : '先着予約を確定する'}
          </button>
        </form>
      )}
    </div>
  );
}