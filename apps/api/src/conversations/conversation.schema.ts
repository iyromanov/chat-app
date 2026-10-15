import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
@Schema({ timestamps: true })
export class Conversation {
  @Prop({ required: true, type: [String] }) participants!: string[];
  @Prop({ required: true }) pairKey!: string;
  @Prop({ required: true, type: Date }) createdAt!: Date;
}
export const conversationSchema = SchemaFactory.createForClass(Conversation);
conversationSchema.index({ pairKey: 1 }, { unique: true });
conversationSchema.index({ participants: 1, createdAt: -1, _id: -1 });
