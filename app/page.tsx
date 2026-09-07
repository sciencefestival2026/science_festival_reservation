'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface MasterSlot {
  id: number;
  booth_name: string;
  event_date: string;
  time_slot: string;
  capacity: number; 
}

interface Entry {
  event_date: string;
  booth_name: string;
  time_slot: string;
  num_people: number;
  status: string;
}

export default function Home() {
  const [masterData, setMasterData] = useState<MasterSlot[]>([]);
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAgreed, setIsAgreed] = useState<boolean>(false);
  
  const [userName, setUserName] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedBooth, setSelectedBooth] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<MasterSlot | null>(null);
  const [numPeople, setNumPeople] = useState<number>(1);
  
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const loadInitialData = async () => {
    const { data: master } = await supabase
      .from('draw_master')
      .select('*')
      .order('event_date', { ascending: true })
      .order('booth_name', { ascending: true })
      .order('time_slot', { ascending: true });

    const { data: entries } = await supabase
      .from('draw_entries')
      .select('event_date, booth_name, time_slot, num_people, status')
      .neq('status', 'キャンセル');

    if (master) setMasterData(master as MasterSlot[]);
    if (entries) setAllEntries(entries as Entry[]);
    setLoading(false);
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // --- 過去日時判定ロジック（タイムゾーン安全版） ---
  const isPastSlot = (eventDate: string, timeSlot: string) => {
    const now = new Date();

    // 1. eventDate ("YYYY-MM-DD") を分解
    const [year, month, day] = eventDate.split('-').map(Number);

    // 2. timeSlot ("20:01-20:20" または "20:01") から開始時刻 "20:01" を抽出して分解
    const startTimeStr = timeSlot.split('-')[0].trim();
    const [hour, minute] = startTimeStr.split(':').map(Number);

    // 3. ローカル時間として Date オブジェクトを作成
    const slotDateTime = new Date(year, month - 1, day, hour || 0, minute || 0, 0);

    // ★ 5分前締め切り計算 (5分 = 5 * 60 * 1000ミリ秒)
    const deadlineMinutes = 5;
    const deadlineTime = new Date(slotDateTime.getTime() - deadlineMinutes * 60 * 1000);

    // 締切時刻を過ぎていたら true（非表示・予約不可）
    return deadlineTime <= now;
  };

  // 1. 未来の枠（開始時刻が過ぎていない枠）のみにフィルタリング
  const validMasterData = masterData.filter(d => !isPastSlot(d.event_date, d.time_slot));

  // 2. プルダウン選択肢の生成（有効な枠のみを基準にする）
  const dateOptions = Array.from(new Set(validMasterData.map(d => d.event_date)));

  const boothOptions = Array.from(
    new Set(validMasterData.filter(d => d.event_date === selectedDate).map(d => d.booth_name))
  );

  const slotOptions = validMasterData
    .filter(d => d.event_date === selectedDate && d.booth_name === selectedBooth)
    .sort((a, b) => a.time_slot.localeCompare(b.time_slot, undefined, { numeric: true }));

  // 選択中の枠の「現在の予約済み人数」を取得
  const getCurrentAppliedCount = () => {
    if (!selectedSlot) return 0;
    
    const matchedEntries = allEntries.filter(e => 
      e.event_date === selectedSlot.event_date &&
      e.booth_name === selectedSlot.booth_name &&
      e.time_slot === selectedSlot.time_slot
    );
    
    return matchedEntries.reduce((sum, item) => sum + item.num_people, 0);
  };

  const currentApplied = getCurrentAppliedCount();
  const remainingSeats = selectedSlot ? selectedSlot.capacity - currentApplied : 0;

  const handleRegister = async () => {
    if (!userName.trim() || !selectedSlot) return;
    
    setIsSubmitting(true);
    setErrorMessage('');

    // ★ 押下時点での過去日時チェック（リアルタイム再確認）
    if (isPastSlot(selectedSlot.event_date, selectedSlot.time_slot)) {
      setErrorMessage('申し訳ありません。対象の時間帯の受付時間を過ぎたため予約できません。');
      setIsSubmitting(false);
      // 最新状態を再取得して過去枠を画面から除外
      await loadInitialData();
      setSelectedSlot(null);
      return;
    }

    // 最新の予約状況を再確認（タッチ差での定員オーバーを防止）
    const { data: latestEntries } = await supabase
      .from('draw_entries')
      .select('num_people')
      .eq('event_date', selectedSlot.event_date)
      .eq('booth_name', selectedSlot.booth_name)
      .eq('time_slot', selectedSlot.time_slot)
      .neq('status', 'キャンセル');

    const latestTotal = (latestEntries || []).reduce((sum, item) => sum + item.num_people, 0);
    const latestRemaining = selectedSlot.capacity - latestTotal;

    if (numPeople > latestRemaining) {
      setErrorMessage(`申し訳ありません。タッチの差で定員に達したため予約できませんでした。（残り枠: ${Math.max(0, latestRemaining)}名）`);
      setIsSubmitting(false);
      // 最新状態を再取得
      await loadInitialData();
      return;
    }

    const { error } = await supabase
      .from('draw_entries')
      .insert([
        {
          user_name: userName.trim(),
          event_date: selectedSlot.event_date,
          booth_name: selectedSlot.booth_name,
          time_slot: selectedSlot.time_slot,
          num_people: numPeople,
          status: '予約確定'
        }
      ]);

    if (error) {
      setErrorMessage('通信エラーが発生しました。時間をおいて再度お試しください。');
      setIsSubmitting(false);
    } else {
      setIsSubmitted(true);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen font-bold text-gray-500">データを読み込み中...</div>;
  }

  if (isSubmitted && selectedSlot) {
    return (
      <div className="flex justify-center items-center p-4 min-h-screen bg-gray-100">
        <div className="p-6 w-full max-w-md bg-white rounded-xl shadow-lg text-center">
          <h2 className="text-2xl font-bold text-green-600 mb-2">先着予約完了</h2>
          <p className="text-sm text-gray-600 mb-6">ご予約が確定いたしました。当日会場でお待ちしております。</p>
          
          <div className="p-4 bg-gray-50 rounded-lg border-2 border-dashed border-blue-500 text-left space-y-2">
            <div className="text-center font-bold text-blue-600 border-b pb-2 mb-2">◆ 予約内容の控え ◆</div>
            <div className="flex justify-between"><span className="text-gray-500 font-bold">お呼び出し名:</span><span className="font-bold">{userName} 様</span></div>
            <div className="flex justify-between"><span className="text-gray-500 font-bold">希望日:</span><span className="font-bold">{selectedSlot.event_date}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 font-bold">希望ブース:</span><span className="font-bold">{selectedSlot.booth_name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 font-bold">時間帯:</span><span className="font-bold">{selectedSlot.time_slot}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 font-bold">予約人数:</span><span className="font-bold">{numPeople} 名</span></div>
            <p className="text-xs text-red-500 font-bold text-center pt-4">※この画面のスクリーンショットを撮影して大切に保管してください。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-md">
        <h1 className="text-xl font-bold text-center text-blue-600 mb-6">人気ブース先着予約フォーム</h1>

        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg text-sm space-y-1">
          <div className="font-bold">【ご応募に際しての注意事項】</div>
          <p>・お名前は当日の呼び出しにのみ使用いたします。</p>
          <p>・本予約は「先着順」です。定員に達し次第受付終了となります。</p>
          <p>・各時間帯の【5分前】に予約受付を締め切ります。</p>
          <p>・予約完了後の変更・キャンセルはできません。</p>
        </div>

        <div 
          className="mb-6 flex items-center gap-2 p-3 bg-gray-50 border rounded-lg cursor-pointer"
          onClick={() => setIsAgreed(!isAgreed)}
        >
          <input type="checkbox" id="agree" checked={isAgreed} readOnly className="cursor-pointer w-4 h-4" />
          <label htmlFor="agree" className="text-sm font-bold cursor-pointer text-gray-700">上記の注意事項に同意します</label>
        </div>

        {isAgreed && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">氏名（お呼び出し名・必須）</label>
              <input 
                type="text" 
                placeholder="ヤマダ タロウ" 
                value={userName} 
                onChange={(e) => setUserName(e.target.value)}
                className="w-full p-2 border rounded-lg text-base"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">1. 希望日を選択</label>
              <select 
                value={selectedDate} 
                onChange={(e) => { setSelectedDate(e.target.value); setSelectedBooth(''); setSelectedSlot(null); }}
                className="w-full p-2 border rounded-lg text-base bg-white"
              >
                <option value="">-- 日付を選択してください --</option>
                {dateOptions.map(date => <option key={date} value={date}>{date}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">2. 希望ブースを選択</label>
              <select 
                value={selectedBooth} 
                disabled={!selectedDate}
                onChange={(e) => { setSelectedBooth(e.target.value); setSelectedSlot(null); }}
                className="w-full p-2 border rounded-lg text-base bg-white disabled:bg-gray-100"
              >
                <option value="">-- 先に日付を選択してください --</option>
                {boothOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">3. 希望時間帯を選択</label>
              <select 
                value={selectedSlot?.id || ''} 
                disabled={!selectedBooth}
                onChange={(e) => {
                  const slot = slotOptions.find(s => s.id === Number(e.target.value));
                  setSelectedSlot(slot || null);
                }}
                className="w-full p-2 border rounded-lg text-base bg-white disabled:bg-gray-100"
              >
                <option value="">-- 先にブースを選択してください --</option>
                {slotOptions.map(s => <option key={s.id} value={s.id}>{s.time_slot}</option>)}
              </select>
              
              {selectedSlot && (
                <div className="mt-2 p-2 bg-blue-50 text-blue-800 rounded-lg text-xs font-bold flex justify-between">
                  <span>定員枠： {selectedSlot.capacity} 名</span>
                  <span className={remainingSeats > 0 ? "text-green-700" : "text-red-600 font-extrabold"}>
                    {remainingSeats > 0 ? `残り残席： ${remainingSeats} 名` : '満席'}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">4. 希望人数</label>
              <input 
                type="number" 
                min="1" 
                max={Math.max(1, remainingSeats)}
                value={numPeople} 
                disabled={!selectedSlot || remainingSeats <= 0}
                onChange={(e) => setNumPeople(Math.max(1, Number(e.target.value)))}
                className="w-full p-2 border rounded-lg text-base disabled:bg-gray-100"
              />
            </div>

            {errorMessage && <div className="text-red-500 font-bold text-sm text-center">{errorMessage}</div>}

            <button
              onClick={handleRegister}
              disabled={!userName.trim() || !selectedSlot || remainingSeats <= 0 || numPeople > remainingSeats || isSubmitting}
              className="w-full mt-4 p-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition"
            >
              {isSubmitting ? '予約処理中...' : remainingSeats <= 0 ? '満席のため予約不可' : '先着予約を確定する'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}