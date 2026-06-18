'use client';

/**
 * 파일 유형별 이모지 아이콘 반환 유틸리티
 */

import React from 'react';
import Image from 'next/image';

// CAD 파일 확장자 목록
const CAD_EXTENSIONS = ['dxf', 'dwg', 'step', 'stp', 'stl', 'iges', 'igs'];

// CAD MIME 타입 목록
const CAD_MIME_TYPES = [
  'application/dxf',
  'image/vnd.dxf',
  'application/x-dxf',
  'application/dwg',
  'image/vnd.dwg',
  'application/acad',
  'image/x-dwg',
];

// MIME 타입 또는 확장자 기반 이모지 매핑
const MIME_TYPE_EMOJIS: Record<string, string> = {
  // 이미지
  'image/': '🖼️',
  'image/gif': '🎞️',
  'image/svg': '🎨',

  // 문서
  'application/pdf': '📕',
  'application/msword': '📘',
  'application/vnd.openxmlformats-officedocument.wordprocessingml': '📘',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml': '📊',
  'application/vnd.ms-powerpoint': '📙',
  'application/vnd.openxmlformats-officedocument.presentationml': '📙',
  'text/plain': '📝',
  'text/csv': '📊',

  // 압축 파일
  'application/zip': '📦',
  'application/x-zip': '📦',
  'application/x-rar': '📦',
  'application/x-7z': '📦',
  'application/gzip': '📦',
  'application/x-tar': '📦',

  // 오디오
  'audio/': '🎵',

  // 비디오
  'video/': '🎬',

  // 코드/개발
  'text/html': '🌐',
  'text/css': '🎨',
  'text/javascript': '⚙️',
  'application/javascript': '⚙️',
  'application/json': '📋',
  'application/xml': '📋',
  'text/xml': '📋',

  // CAD/설계
  'application/dxf': '📐',
  'image/vnd.dxf': '📐',
  'application/x-dxf': '📐',
  'application/dwg': '📐',
  'image/vnd.dwg': '📐',

  // 폰트
  'font/': '🔤',
  'application/font': '🔤',

  // 실행 파일
  'application/x-msdownload': '⚙️',
  'application/x-executable': '⚙️',
};

// 확장자 기반 이모지 매핑 (MIME 타입으로 매칭 안 될 경우 사용)
const EXTENSION_EMOJIS: Record<string, string> = {
  // 이미지
  jpg: '🖼️',
  jpeg: '🖼️',
  png: '🖼️',
  gif: '🎞️',
  bmp: '🖼️',
  webp: '🖼️',
  svg: '🎨',
  ico: '🖼️',
  tiff: '🖼️',
  tif: '🖼️',

  // 문서
  pdf: '📕',
  doc: '📘',
  docx: '📘',
  xls: '📊',
  xlsx: '📊',
  ppt: '📙',
  pptx: '📙',
  txt: '📝',
  rtf: '📝',
  csv: '📊',
  md: '📝',

  // 압축
  zip: '📦',
  rar: '📦',
  '7z': '📦',
  tar: '📦',
  gz: '📦',

  // 오디오
  mp3: '🎵',
  wav: '🎵',
  ogg: '🎵',
  flac: '🎵',
  aac: '🎵',
  m4a: '🎵',

  // 비디오
  mp4: '🎬',
  avi: '🎬',
  mkv: '🎬',
  mov: '🎬',
  wmv: '🎬',
  webm: '🎬',
  flv: '🎬',

  // 코드
  html: '🌐',
  htm: '🌐',
  css: '🎨',
  js: '⚙️',
  ts: '⚙️',
  jsx: '⚙️',
  tsx: '⚙️',
  json: '📋',
  xml: '📋',
  py: '🐍',
  java: '☕',
  cpp: '⚙️',
  c: '⚙️',
  h: '⚙️',
  cs: '⚙️',
  rb: '💎',
  php: '🐘',
  go: '🐹',
  rs: '🦀',
  swift: '🍎',
  kt: '🟣',

  // CAD/설계
  dxf: '📐',
  dwg: '📐',
  step: '📐',
  stp: '📐',
  stl: '📐',
  iges: '📐',
  igs: '📐',

  // 폰트
  ttf: '🔤',
  otf: '🔤',
  woff: '🔤',
  woff2: '🔤',
  eot: '🔤',

  // 기타
  exe: '⚙️',
  dll: '⚙️',
  dmg: '💿',
  iso: '💿',
  apk: '📱',
  ipa: '📱',
};

// 기본 이모지
const DEFAULT_EMOJI = '📄';

/**
 * MIME 타입과 파일명을 기반으로 적절한 이모지 아이콘 반환
 * @param mimeType MIME 타입 문자열
 * @param fileName 파일명 (확장자 추출용, 선택적)
 * @returns 이모지 문자열
 */
export function getFileEmoji(mimeType?: string | null, fileName?: string | null): string {
  // MIME 타입 기반 검색 (정확한 매칭 우선)
  if (mimeType) {
    // 정확한 MIME 타입 매칭
    for (const [key, emoji] of Object.entries(MIME_TYPE_EMOJIS)) {
      if (mimeType === key || mimeType.startsWith(key)) {
        return emoji;
      }
    }
  }

  // 파일명에서 확장자 추출
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext && EXTENSION_EMOJIS[ext]) {
      return EXTENSION_EMOJIS[ext];
    }
  }

  // MIME 타입으로 카테고리별 매칭
  if (mimeType) {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('text/')) return '📝';
    if (mimeType.startsWith('font/')) return '🔤';
  }

  return DEFAULT_EMOJI;
}

/**
 * 파일 유형에 따른 색상 클래스 반환
 * @param mimeType MIME 타입 문자열
 * @returns Tailwind 색상 클래스
 */
export function getFileIconColor(mimeType?: string | null): string {
  if (!mimeType) return 'text-gray-500';

  if (mimeType.startsWith('image/')) return 'text-purple-500';
  if (mimeType.includes('pdf')) return 'text-red-500';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-500';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'text-green-500';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation'))
    return 'text-orange-500';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z'))
    return 'text-yellow-500';
  if (mimeType.startsWith('audio/')) return 'text-pink-500';
  if (mimeType.startsWith('video/')) return 'text-indigo-500';
  if (mimeType.includes('dxf') || mimeType.includes('dwg')) return 'text-cyan-500';

  return 'text-gray-500';
}

/**
 * CAD 파일인지 확인
 */
function isCadFile(mimeType?: string | null, fileName?: string | null): boolean {
  // MIME 타입으로 확인
  if (
    mimeType &&
    CAD_MIME_TYPES.some(
      (type) => mimeType.includes(type) || mimeType.includes('dxf') || mimeType.includes('dwg')
    )
  ) {
    return true;
  }

  // 확장자로 확인
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext && CAD_EXTENSIONS.includes(ext)) {
      return true;
    }
  }

  return false;
}

/**
 * PDF 파일인지 확인
 */
function isPdfFile(mimeType?: string | null, fileName?: string | null): boolean {
  if (mimeType && mimeType.includes('pdf')) {
    return true;
  }

  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      return true;
    }
  }

  return false;
}

/**
 * 파일 아이콘을 React 컴포넌트로 반환 (CAD 파일은 이미지 아이콘 사용)
 * @param mimeType MIME 타입 문자열
 * @param fileName 파일명 (확장자 추출용, 선택적)
 * @param size 아이콘 크기 ('sm' | 'md' | 'lg')
 * @returns React 노드 (이모지 또는 이미지)
 */
export function getFileIcon(
  mimeType?: string | null,
  fileName?: string | null,
  size: 'sm' | 'md' | 'lg' = 'md'
): React.ReactNode {
  const sizeMap = {
    sm: 16,
    md: 24,
    lg: 40,
  };
  const iconSize = sizeMap[size];

  // CAD 파일인 경우 이미지 아이콘 반환
  if (isCadFile(mimeType, fileName)) {
    return React.createElement(Image, {
      src: '/icons/cad-icon.ico',
      alt: 'CAD 파일',
      width: iconSize,
      height: iconSize,
      className: 'inline-block',
    });
  }

  // PDF 파일인 경우 이미지 아이콘 반환
  if (isPdfFile(mimeType, fileName)) {
    return React.createElement(Image, {
      src: '/icons/pdf-icon.svg',
      alt: 'PDF 파일',
      width: iconSize,
      height: iconSize,
      className: 'inline-block',
    });
  }

  // 그 외 파일은 이모지 반환
  return getFileEmoji(mimeType, fileName);
}
