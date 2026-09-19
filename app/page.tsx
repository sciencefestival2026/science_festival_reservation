'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface MasterSlot {
  id: number;
  booth_name: string;
  event_date: string;
  time_slot: string;
  capacity: number;
  booking_start_at?: string;
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
  
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const loadInitialData = async () => {
    const { data: master } = await supabase
      .from('draw_master')
      .select('*')
      .neq('booth_name', 'とんぼ玉を作ろう！')
      .order('event_date', { ascending: true })
      .order('booth_name', { ascending: true })
      .order('time_slot', { ascending: true });

    const { data: entries } = await supabase
      .from('draw_entries')
      .select('event_date, booth_name, time_slot, num_people, status')
      .neq('booth_name', 'とんぼ玉を作ろう！')
      .neq('status', 'キャンセル');

    if (master) setMasterData(master as MasterSlot[]);
    if (entries) setAllEntries(entries as Entry[]);
    setLoading(false);
  };

  useEffect(() => {
    loadInitialData().then(() => {
      // データの読み込み完了後、希望日を「2026-09-20」にデフォルト設定
      setSelectedDate('2026-09-20');
    });
  }, []);

  const isPastSlot = (eventDate: string, timeSlot: string) => {
    const now = new Date();
    const [year, month, day] = eventDate.split('-').map(Number);
    const startTimeStr = timeSlot.split('-')[0].trim();
    const [hour, minute] = startTimeStr.split(':').map(Number);
    const slotDateTime = new Date(year, month - 1, day, hour || 0, minute || 0, 0);

    const deadlineMinutes = 5;
    const deadlineTime = new Date(slotDateTime.getTime() - deadlineMinutes * 60 * 1000);
    return deadlineTime <= now;
  };

  const isBeforeStart = (bookingStartAt?: string) => {
    if (!bookingStartAt) return false;
    const now = new Date();
    const startAt = new Date(bookingStartAt);
    return now < startAt;
  };

  const getSlotRemaining = (slot: MasterSlot) => {
    const matchedEntries = allEntries.filter(e => 
      e.event_date === slot.event_date &&
      e.booth_name === slot.booth_name &&
      e.time_slot === slot.time_slot
    );
    const used = matchedEntries.reduce((sum, item) => sum + (item.num_people || 1), 0);
    return slot.capacity - used;
  };

  const validMasterData = masterData.filter(d => !isPastSlot(d.event_date, d.time_slot));
  const dateOptions = Array.from(new Set(validMasterData.map(d => d.event_date)));
  const boothOptions = Array.from(new Set(validMasterData.filter(d => d.event_date === selectedDate).map(d => d.booth_name)));
  const slotOptions = validMasterData
    .filter(d => d.event_date === selectedDate && d.booth_name === selectedBooth)
    .sort((a, b) => a.time_slot.localeCompare(b.time_slot, undefined, { numeric: true }));

  const remainingSeats = selectedSlot ? getSlotRemaining(selectedSlot) : 0;
  const isSlotBeforeStart = selectedSlot ? isBeforeStart(selectedSlot.booking_start_at) : false;

  // 1次チェック：確認画面を開く直前に最新の残数をリアルタイムチェック
  const handleOpenConfirm = async () => {
    if (!userName.trim() || !selectedSlot) return;
    setErrorMessage('');

    const { data: latestEntries } = await supabase
      .from('draw_entries')
      .select('num_people')
      .eq('event_date', selectedSlot.event_date)
      .eq('booth_name', selectedSlot.booth_name)
      .eq('time_slot', selectedSlot.time_slot)
      .neq('status', 'キャンセル');

    const latestTotal = (latestEntries || []).reduce((sum, item) => sum + (item.num_people || 1), 0);
    const latestRemaining = selectedSlot.capacity - latestTotal;

    if (numPeople > latestRemaining) {
      setErrorMessage(`申し訳ありません。最新の残数が不足しているため確認画面に進めません。（残り枠: ${Math.max(0, latestRemaining)}名）`);
      await loadInitialData();
      return;
    }

    setShowConfirmModal(true);
  };

  // 2次チェック：送信直前のダブルチェック＆書き込み処理
  const handleRegister = async () => {
    if (!userName.trim() || !selectedSlot) return;
    
    setIsSubmitting(true);
    setErrorMessage('');

    if (isBeforeStart(selectedSlot.booking_start_at)) {
      setErrorMessage('申し訳ありません。この枠はまだ予約受付開始時間前です。');
      setIsSubmitting(false);
      setShowConfirmModal(false);
      await loadInitialData();
      return;
    }

    if (isPastSlot(selectedSlot.event_date, selectedSlot.time_slot)) {
      setErrorMessage('申し訳ありません。対象の時間帯の受付時間を過ぎたため予約できません。');
      setIsSubmitting(false);
      setShowConfirmModal(false);
      await loadInitialData();
      setSelectedSlot(null);
      return;
    }

    const { data: latestEntries, error: fetchErr } = await supabase
      .from('draw_entries')
      .select('num_people')
      .eq('event_date', selectedSlot.event_date)
      .eq('booth_name', selectedSlot.booth_name)
      .eq('time_slot', selectedSlot.time_slot)
      .neq('status', 'キャンセル');

    if (fetchErr) {
      setErrorMessage('通信エラーが発生しました。もう一度お試しください。');
      setIsSubmitting(false);
      return;
    }

    const latestTotal = (latestEntries || []).reduce((sum, item) => sum + (item.num_people || 1), 0);
    const latestRemaining = selectedSlot.capacity - latestTotal;

    if (numPeople > latestRemaining) {
      setErrorMessage(`申し訳ありません。直前に定員に達したため予約できませんでした。（残り枠: ${Math.max(0, latestRemaining)}名）`);
      setIsSubmitting(false);
      setShowConfirmModal(false);
      await loadInitialData();
      return;
    }

    const { error: insertErr } = await supabase
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

    if (insertErr) {
      setErrorMessage('通信エラーが発生しました。時間をおいて再度お試しください。');
      setIsSubmitting(false);
      setShowConfirmModal(false);
    } else {
      setShowConfirmModal(false);
      setIsSubmitted(true);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen font-bold text-gray-500">データを読み込み中...</div>;
  }

  // 予約完了画面
  if (isSubmitted && selectedSlot) {
    return (
      <div className="flex justify-center items-center p-4 min-h-screen bg-gray-100">
        <div className="p-6 w-full max-w-md bg-white rounded-xl shadow-lg text-center">
          <h2 className="text-2xl font-bold text-green-600 mb-2">先着予約完了</h2>
          <p className="text-sm text-gray-600 mb-4">ご予約が確定いたしました。当日会場でお待ちしております。</p>
          
          <div className="p-4 bg-gray-50 rounded-lg border-2 border-dashed border-blue-500 text-left space-y-2">
            <div className="text-center font-bold text-blue-600 border-b pb-2 mb-2">◆ 予約内容の控え ◆</div>
            <div className="flex justify-between"><span className="text-gray-500 font-bold">お呼び出し名:</span><span className="font-bold">{userName} 様</span></div>
            <div className="flex justify-between"><span className="text-gray-500 font-bold">希望日:</span><span className="font-bold">{selectedSlot.event_date}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 font-bold">希望ブース:</span><span className="font-bold">{selectedSlot.booth_name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 font-bold">時間帯:</span><span className="font-bold">{selectedSlot.time_slot}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 font-bold">予約人数:</span><span className="font-bold">{numPeople} 名</span></div>
            
            {/* ② 送信完了画面：少し大きく目立たせた注意書き */}
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-center">
              <p className="text-base font-extrabold text-red-600 leading-snug">
                ※この画面のスクリーンショットを撮影し、大切に保管してください。
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-md">
        <h1 className="text-xl font-bold text-center text-blue-600 mb-6">一般ブース先着予約フォーム</h1>

        {/* 注意事項 */}
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg text-sm space-y-1">
          <div className="font-bold">【ご応募に際しての注意事項】</div>
          <p>・お名前は当日の呼び出しにのみ使用いたします。</p>
          <p>・本予約は「先着順」です。定員に達し次第受付終了となります。</p>
          <p className="font-bold text-amber-900">・希望人数には、体験者数のみ入力してください。同伴の保護者様等体験されない方は含めないでください。</p>
          <p className="font-bold text-amber-900">・トンボ玉以外のブースは、会場～12:59開始までの予約枠は10:00から、13:00～の予約枠は12:00から予約可能となります。</p>
          <p>・各時間帯の【5分前】に予約受付を締め切ります。</p>
          <p>・予約完了後の変更・キャンセルはできません。</p>
          <p className="font-bold text-amber-900">・生物学科のブースのみ、整理券を一部、紙でもお渡ししております。</p>
          <p className="font-bold text-amber-900">・ご予約いただいた体験開始時刻から【5分】を過ぎると体験できなくなります。時間に余裕をもってお越しください。</p>
          <p>・システムに不具合が発生した場合、紙での整理券配布に切り替えることとなります。ご了承ください。</p>
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
                  setNumPeople(1);
                }}
                className="w-full p-2 border rounded-lg text-base bg-white disabled:bg-gray-100"
              >
                <option value="">-- 先にブースを選択してください --</option>
                {slotOptions.map(s => {
                  const beforeStart = isBeforeStart(s.booking_start_at);
                  const rem = getSlotRemaining(s);
                  const isDisabled = beforeStart || rem <= 0;
                  
                  let label = s.time_slot;
                  if (beforeStart) {
                    const startStr = s.booking_start_at 
                      ? new Date(s.booking_start_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                      : '';
                    label += ` 【受付前 ${startStr}〜】`;
                  } else if (rem <= 0) {
                    label += ` 【満席】`;
                  } else {
                    label += ` 【残り ${rem}名】`;
                  }

                  return (
                    <option key={s.id} value={s.id} disabled={isDisabled}>
                      {label}
                    </option>
                  );
                })}
              </select>
              
              {selectedSlot && (
                <div className="mt-2 p-2 bg-blue-50 text-blue-800 rounded-lg text-xs font-bold flex justify-between items-center">
                  <span>定員枠： {selectedSlot.capacity} 名</span>
                  {isSlotBeforeStart ? (
                    <span className="text-red-600 font-extrabold">受付開始前</span>
                  ) : (
                    <span className={remainingSeats > 0 ? "text-green-700" : "text-red-600 font-extrabold"}>
                      {remainingSeats > 0 ? `残り残席： ${remainingSeats} 名` : '満席'}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">4. 希望人数（体験者数）</label>
              <select
                value={numPeople}
                disabled={!selectedSlot || remainingSeats <= 0 || isSlotBeforeStart}
                onChange={(e) => setNumPeople(Number(e.target.value))}
                className="w-full p-2 border rounded-lg text-base bg-white disabled:bg-gray-100"
              >
                {(!selectedSlot || remainingSeats <= 0 || isSlotBeforeStart) ? (
                  <option value={1}>1 名</option>
                ) : (
                  Array.from({ length: Math.max(1, remainingSeats) }, (_, i) => i + 1).map((num) => (
                    <option key={num} value={num}>
                      {num} 名
                    </option>
                  ))
                )}
              </select>
            </div>

            {errorMessage && <div className="text-red-500 font-bold text-sm text-center">{errorMessage}</div>}

            <button
              onClick={handleOpenConfirm}
              disabled={
                !userName.trim() ||
                !selectedSlot ||
                remainingSeats <= 0 ||
                numPeople > remainingSeats ||
                isSlotBeforeStart ||
                isSubmitting
              }
              className="w-full mt-4 p-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition"
            >
              {isSlotBeforeStart
                ? `${selectedSlot?.booking_start_at ? new Date(selectedSlot.booking_start_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''} 受付開始`
                : remainingSeats <= 0
                ? '満席のため予約不可'
                : '予約内容を確認する'}
            </button>
          </div>
        )}
      </div>

      {/* --- ① 予約内容確認モーダル --- */}
      {showConfirmModal && selectedSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-center text-gray-800 mb-2 border-b pb-2">
              予約内容の確認
            </h3>
            
            {/* ① 注意書きの追加 */}
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1 mb-4">
              <p className="font-extrabold text-red-600 text-center">
                ※まだ予約は完了していません。「予約を確定する」を押してください。
              </p>
              <p className="text-center font-bold text-gray-700">
                ※確定後の画面でスクリーンショットの撮影をお願いいたします。
              </p>
            </div>

            <div className="space-y-3 bg-gray-50 p-4 rounded-lg text-sm mb-6">
              <div className="flex justify-between">
                <span className="text-gray-500">お呼び出し名:</span>
                <span className="font-bold text-gray-800">{userName} 様</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">希望日:</span>
                <span className="font-bold text-gray-800">{selectedSlot.event_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ブース名:</span>
                <span className="font-bold text-blue-600">{selectedSlot.booth_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">時間帯:</span>
                <span className="font-bold text-gray-800">{selectedSlot.time_slot}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-500">予約人数:</span>
                <span className="font-bold text-red-600 text-base">{numPeople} 名</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="w-1/2 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-sm transition"
              >
                修正する
              </button>
              <button
                type="button"
                onClick={handleRegister}
                disabled={isSubmitting}
                className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition disabled:bg-gray-400"
              >
                {isSubmitting ? '処理中...' : '予約を確定する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}