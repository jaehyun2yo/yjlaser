'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
} from '@/components/ui/modal';
import { logger } from '@/lib/utils/logger';

const editModalLog = logger.createLogger('BookingEditModal');

const TIME_SLOTS = [
  '9:00~10:00',
  '10:00~11:00',
  '11:00~12:00',
  '13:00~14:00',
  '14:00~15:00',
  '15:00~16:00',
  '16:00~17:00',
  '17:00~18:00',
];

export interface BookingEditModalBooking {
  id: number;
  visit_date: string;
  visit_time_slot: string;
  notes: string | null;
}

interface BookingEditModalProps {
  booking: BookingEditModalBooking | null;
  open: boolean;
  onClose: () => void;
}

export function BookingEditModal({ booking, open, onClose }: BookingEditModalProps) {
  const [visitDate, setVisitDate] = useState('');
  const [visitTimeSlot, setVisitTimeSlot] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (booking && open) {
      setVisitDate(booking.visit_date);
      setVisitTimeSlot(booking.visit_time_slot);
      setAdminNote(booking.notes ?? '');
      setError(null);
    }
  }, [booking, open]);

  const handleSubmit = async () => {
    if (!booking) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitDate,
          visitTimeSlot,
          adminNote,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? '예약 수정에 실패했습니다.');
        return;
      }
      onClose();
    } catch (err) {
      editModalLog.error('Booking edit failed', err);
      setError('예약 수정 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>예약 수정</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label htmlFor="booking-edit-date" className="block text-sm font-medium mb-1">
                방문 일자
              </label>
              <Input
                id="booking-edit-date"
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="booking-edit-slot" className="block text-sm font-medium mb-1">
                시간 슬롯
              </label>
              <select
                id="booking-edit-slot"
                value={visitTimeSlot}
                onChange={(e) => setVisitTimeSlot(e.target.value)}
                className="w-full border border-border rounded-lg bg-card text-foreground px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="booking-edit-note" className="block text-sm font-medium mb-1">
                관리자 메모
              </label>
              <Textarea
                id="booking-edit-note"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={4}
                placeholder="관리자 메모를 입력하세요"
              />
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '저장 중...' : '저장'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
