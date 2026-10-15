import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true }) email!: string;
  @Prop({ required: true }) username!: string;
  @Prop({ required: true }) normalizedEmail!: string;
  @Prop({ required: true }) normalizedUsername!: string;
  @Prop({ required: true, select: false }) passwordHash!: string;
}
export const userSchema = SchemaFactory.createForClass(User);
userSchema.index({ normalizedEmail: 1 }, { unique: true });
userSchema.index({ normalizedUsername: 1 }, { unique: true });

userSchema.index({ normalizedUsername: 1, _id: 1 });
