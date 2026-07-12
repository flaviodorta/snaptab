import { z } from 'zod';

// Shape mínimo do evento S3 ObjectCreated entregue via SQS (body do record).
// Validamos só o que o processor consome: bucket e object key.
// Atenção: eventos de teste do S3 ("s3:TestEvent") não têm `Records` — o
// safeParse falha e o processor deve ackar como irrecuperável, sem retry.
export const s3ObjectCreatedEventSchema = z.object({
  Records: z
    .array(
      z.object({
        eventName: z.string(),
        s3: z.object({
          bucket: z.object({ name: z.string().min(1) }),
          // Vem URL-encoded (espaço vira '+'); decodificar antes de usar.
          object: z.object({ key: z.string().min(1) }),
        }),
      }),
    )
    .min(1),
});
export type S3ObjectCreatedEvent = z.infer<typeof s3ObjectCreatedEventSchema>;
