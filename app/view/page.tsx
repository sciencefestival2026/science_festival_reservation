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
  status: string;
}

export default function StaffViewPage() {
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedBooth, setSelectedBooth] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');

  useEffect(() => {
    async function loadLogData() {
      // 「予約確定」または過去の「当選」データのみを取得
      const { data, error } = await supabase
        .from('draw_entries')
        .select('*')
        .in('status', ['予約確定', '当選']);

      if (error) {
        console.error('名簿取得エラー:', error);
      } else if (data) {
        const sorted = (data as Entry[]).sort((a, b) => {
          if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date);
          if (a.booth_name !== b.booth_name) return a.booth_name.localeCompare(b.booth_name);
          return a.time_slot.localeCompare(b.time_slot);
        });
        setAllEntries(sorted);
      }
      setLoading(false);
    }
    loadLogData();
  }, []);

  useEffect(() => {
    if (!loading && allEntries.length > 0) {
      const savedDate = localStorage.getItem('staff_fDate') || '';
      const savedBooth = localStorage.getItem('staff_fBooth') || '';
      const savedTime = localStorage.getItem('staff_fTime') || '';

      if (savedDate) setSelectedDate(savedDate);
      if (savedBooth) setSelectedBooth(savedBooth);
      if (savedTime) setSelectedTime(savedTime);
    }
  }, [loading, allEntries]);

  const dateOptions = Array.from(new Set(allEntries.map(item => item.event_date))).sort();

  const boothOptions = Array.from(
    new Set(allEntries.filter(item => !selectedDate || item.event_date === selectedDate).map(item => item.booth_name))
  ).sort();

  const timeOptions = Array.from(
    new Set(
      allEntries
        .filter(item => (!selectedDate || item.event_date === selectedDate) && (!selectedBooth || item.booth_name === selectedBooth))
        .map(item => item.time_slot)
    )
  ).sort();

  const handleDateChange = (val: string) => {
    setSelectedDate(val);
    setSelectedBooth('');
    setSelectedTime('');
    localStorage.setItem('staff_fDate', val);
    localStorage.removeItem('staff_fBooth');
    localStorage.removeItem('staff_fTime');
  };

  const handleBoothChange = (val: string) => {
    setSelectedBooth(val);
    setSelectedTime('');
    localStorage.setItem('staff_fBooth', val);
    localStorage.removeItem('staff_fTime');
  };

  const handleTimeChange = (val: string) => {
    setSelectedTime(val);
    localStorage.setItem('staff_fTime', val);
  };

  const displayedEntries = allEntries.filter(item => {
    return (!selectedDate || item.event_date === selectedDate) &&
           (!selectedBooth || item.booth_name === selectedBooth) &&
           (!selectedTime || item.time_slot === selectedTime);
  });

  const totalPeople = displayedEntries.reduce((sum, item) => sum + item.num_people, 0);

  if (loading) return <div className="p-6 text-center text-gray-500 font-bold">最新の名簿データを読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-gray-800 text-white p-4 text-center shadow-md">
        <h1 className="text-lg font-bold">【運営スタッフ専用】当日受付・予約者名簿</h1>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="bg-gray-200 p-4 rounded-xl shadow-inner grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">1. 開催日</label>
            <select
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm bg-white"
            >
              <option value="">すべて</option>
              {dateOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">2. ブース名</label>
            <select
              value={selectedBooth}
              disabled={!selectedDate}
              onChange={(e) => handleBoothChange(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm bg-white disabled:bg-gray-100"
            >
              <option value="">すべて</option>
              {boothOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">3. 時間帯</label>
            <select
              value={selectedTime}
              disabled={!selectedBooth}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm bg-white disabled:bg-gray-100"
            >
              <option value="">すべて</option>
              {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="text-right text-sm font-bold text-blue-600 pr-1">
          該当: {displayedEntries.length} 組 / 合計人数: {totalPeople} 名
        </div>

        <div className="bg-white rounded-xl shadow border overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 border-b text-gray-600">
                <th className="p-3 font-bold">お呼び出し名</th>
                <th className="p-3 font-bold hidden sm:table-cell">開催日</th>
                <th className="p-3 font-bold hidden sm:table-cell">ブース</th>
                <th className="p-3 font-bold">時間枠</th>
                <th className="p-3 font-bold w-20 text-center">人数</th>
              </tr>
            </thead>
            <tbody>
              {displayedEntries.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400 italic">該当する予約データはありません。</td></tr>
              ) : (
                displayedEntries.map(item => (
                  <tr key={item.id} className="border-b hover:bg-gray-50 transition">
                    <td className="p-3 font-bold text-gray-800">{item.user_name}</td>
                    <td className="p-3 text-gray-500 text-xs hidden sm:table-cell">{item.event_date}</td>
                    <td className="p-3 text-gray-500 text-xs hidden sm:table-cell">{item.booth_name}</td>
                    <td className="p-3 text-gray-700 font-medium">{item.time_slot}</td>
                    <td className="p-3 font-bold text-blue-600 text-center">{item.num_people}名</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}