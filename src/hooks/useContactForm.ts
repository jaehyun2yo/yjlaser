// Contact Form 상태 관리 커스텀 훅

import { useState, useEffect } from 'react';
import type {
  ContactFormInitialValues,
  ContactFormState,
  ContactType,
  ServiceTypes,
} from '@/types/contact';

const createInitialState = (
  initialValues?: ContactFormInitialValues | null
): Omit<ContactFormState, 'currentStep' | 'isSubmitting' | 'showSuccessModal'> => ({
  contactType: 'company',
  serviceTypes: {
    moldRequest: false,
    deliveryBrokerage: false,
  },
  companyName: initialValues?.companyName || '',
  name: initialValues?.name || '',
  position: initialValues?.position || '',
  phone: initialValues?.phone || '',
  email: initialValues?.email || '',
  referralSource: initialValues ? '기존업체' : '',
  referralSourceOther: '',
  drawingType: '',
  hasPhysicalSample: false,
  hasReferencePhotos: false,
  drawingModification: '',
  boxShape: '',
  length: '',
  width: '',
  height: '',
  material: '',
  drawingNotes: '',
  sampleNotes: '',
  receiptMethod: '',
  visitLocation: '',
  visitDate: '',
  visitTimeSlot: '',
  deliveryAddress: '',
  deliveryName: '',
  deliveryPhone: '',
  deliveryType: '',
});

export const useContactForm = (initialValues?: ContactFormInitialValues | null) => {
  const [formState, setFormState] = useState<ContactFormState>({
    ...createInitialState(initialValues),
    currentStep: 1,
    isSubmitting: false,
    showSuccessModal: false,
  });

  // 초기값이 변경되면 state 업데이트
  useEffect(() => {
    if (initialValues) {
      setFormState((prev) => ({
        ...prev,
        companyName: initialValues.companyName || prev.companyName,
        name: initialValues.name || prev.name,
        position: initialValues.position || prev.position,
        phone: initialValues.phone || prev.phone,
        email: initialValues.email || prev.email,
        referralSource: '기존업체',
        contactType: 'company',
      }));
    }
  }, [initialValues]);

  const updateField = <K extends keyof ContactFormState>(field: K, value: ContactFormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const updateServiceTypes = (type: keyof ServiceTypes) => {
    setFormState((prev) => ({
      ...prev,
      serviceTypes: {
        ...prev.serviceTypes,
        [type]: !prev.serviceTypes[type],
      },
    }));
  };

  const setContactType = (type: ContactType) => {
    setFormState((prev) => ({ ...prev, contactType: type }));
  };

  const nextStep = () => {
    setFormState((prev) => ({ ...prev, currentStep: Math.min(prev.currentStep + 1, 4) }));
  };

  const prevStep = () => {
    setFormState((prev) => ({ ...prev, currentStep: Math.max(prev.currentStep - 1, 1) }));
  };

  const setStep = (step: number) => {
    setFormState((prev) => ({ ...prev, currentStep: Math.max(1, Math.min(4, step)) }));
  };

  return {
    formState,
    updateField,
    updateServiceTypes,
    setContactType,
    nextStep,
    prevStep,
    setStep,
  };
};
