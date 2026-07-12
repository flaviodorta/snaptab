import { describe, expect, it } from 'vitest';
import { listReceiptsResponseSchema, uploadUrlRequestSchema } from './api';
import { s3ObjectCreatedEventSchema } from './events';

describe('uploadUrlRequestSchema', () => {
  it('aceita content types de imagem suportados', () => {
    for (const contentType of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(uploadUrlRequestSchema.safeParse({ contentType }).success).toBe(true);
    }
  });

  it('rejeita content type não suportado', () => {
    for (const contentType of ['application/pdf', 'text/html', '']) {
      expect(uploadUrlRequestSchema.safeParse({ contentType }).success).toBe(false);
    }
  });
});

describe('s3ObjectCreatedEventSchema', () => {
  it('aceita um evento ObjectCreated real', () => {
    const event = {
      Records: [
        {
          eventVersion: '2.1',
          eventSource: 'aws:s3',
          eventName: 'ObjectCreated:Put',
          s3: {
            bucket: { name: 'snaptab-receipts' },
            object: { key: 'user-123/01J8ZQ7C3M9WXYZABCDEF01234', size: 12345 },
          },
        },
      ],
    };
    const parsed = s3ObjectCreatedEventSchema.parse(event);
    expect(parsed.Records[0]?.s3.object.key).toContain('user-123/');
  });

  it('rejeita o evento de teste do S3 (sem Records)', () => {
    const testEvent = { Service: 'Amazon S3', Event: 's3:TestEvent', Bucket: 'snaptab-receipts' };
    expect(s3ObjectCreatedEventSchema.safeParse(testEvent).success).toBe(false);
  });

  it('rejeita Records vazio', () => {
    expect(s3ObjectCreatedEventSchema.safeParse({ Records: [] }).success).toBe(false);
  });
});

describe('listReceiptsResponseSchema', () => {
  it('aceita lista vazia sem cursor', () => {
    expect(listReceiptsResponseSchema.safeParse({ items: [] }).success).toBe(true);
  });
});
