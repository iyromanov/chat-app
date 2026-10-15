import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
@Schema()
export class Message {
  @Prop({ required: true }) conversationId!: string;
  @Prop({ required: true }) senderId!: string;
  @Prop({ required: true }) text!: string;
  @Prop({ required: true }) attemptId!: string;
  @Prop({ required: true, type: Date }) createdAt!: Date;
}
export const messageSchema = SchemaFactory.createForClass(Message);
messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
messageSchema.index(
  { conversationId: 1, senderId: 1, attemptId: 1 },
  { unique: true },
);
