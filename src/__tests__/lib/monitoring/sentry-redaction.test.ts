import { redactSentryEventUrl } from '@/lib/monitoring/sentry/redaction';

describe('redactSentryEventUrl', () => {
  it('event request url의 query와 hash token 값을 제거한다', () => {
    const event = {
      request: {
        url: 'https://www.yjlaser.net/reset-password?token=query-token#token=hash-token',
      },
    };

    expect(redactSentryEventUrl(event)).toEqual({
      request: {
        url: 'https://www.yjlaser.net/reset-password?token=%5BFiltered%5D#token=%5BFiltered%5D',
      },
    });
  });

  it('event request query_string과 navigation breadcrumb URL token을 제거한다', () => {
    const event = {
      request: {
        url: 'https://www.yjlaser.net/reset-password',
        query_string: 'token=query-token&next=%2Flogin',
      },
      breadcrumbs: [
        {
          category: 'navigation',
          data: {
            from: '/reset-password#token=hash-token',
            to: '/reset-password',
          },
        },
      ],
    };

    expect(redactSentryEventUrl(event)).toEqual({
      request: {
        url: 'https://www.yjlaser.net/reset-password',
        query_string: 'token=%5BFiltered%5D&next=%2Flogin',
      },
      breadcrumbs: [
        {
          category: 'navigation',
          data: {
            from: '/reset-password#token=%5BFiltered%5D',
            to: '/reset-password',
          },
        },
      ],
    });
  });

  it('객체형 request query_string token 값을 제거한다', () => {
    const event = {
      request: {
        query_string: {
          token: 'query-token',
          next: '/login',
        },
      },
    };

    expect(redactSentryEventUrl(event)).toEqual({
      request: {
        query_string: {
          token: '[Filtered]',
          next: '/login',
        },
      },
    });
  });
});
