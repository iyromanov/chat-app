<script lang="ts">
  import { loginSchema, type Login } from '@chat/contracts/auth';
  import { ApiError } from '@shared/api';
  import { Alert, Button, Helper, Input, Label } from 'flowbite-svelte';
  let {
    onLogin,
  }: {
    onLogin: (input: Login) => Promise<void>;
  } = $props();
  let email = $state('');
  let password = $state('');
  let pending = $state(false);
  let error = $state('');
  let fields = $state<Record<string, string[]>>({});

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return;
    error = '';
    fields = {};
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const nextFields: Record<string, string[]> = {};
      for (const issue of parsed.error.issues)
        (nextFields[issue.path.join('.')] ??= []).push(issue.message);
      fields = nextFields;
      error = 'Check the provided fields';
      return;
    }
    pending = true;
    try {
      await onLogin(parsed.data);
      password = '';
    } catch (cause) {
      error =
        cause instanceof ApiError
          ? cause.message
          : 'Unable to reach the server. Please try again';
      if (cause instanceof ApiError) fields = cause.body.fields ?? {};
    } finally {
      pending = false;
    }
  }
</script>

<form
  onsubmit={submit}
  class="flex flex-col gap-5"
  novalidate
  aria-busy={pending}
>
  <div class="flex flex-col gap-2">
    <Label for="email" color={fields.email ? 'red' : 'gray'}>Email</Label>
    <Input
      class="text-base sm:text-sm"
      id="email"
      type="email"
      autocomplete="email"
      bind:value={email}
      color={fields.email ? 'red' : 'default'}
      disabled={pending}
      required
      aria-invalid={!!fields.email}
      aria-describedby={fields.email ? 'email-error' : undefined}
    />
    {#if fields.email}
      <Helper id="email-error" color="red" role="alert"
        >{fields.email.join('. ')}</Helper
      >
    {/if}
  </div>
  <div class="flex flex-col gap-2">
    <Label for="password" color={fields.password ? 'red' : 'gray'}
      >Password</Label
    >
    <Input
      class="text-base sm:text-sm"
      id="password"
      type="password"
      autocomplete="current-password"
      bind:value={password}
      color={fields.password ? 'red' : 'default'}
      disabled={pending}
      required
      aria-invalid={!!fields.password}
      aria-describedby={fields.password
        ? 'password-help password-error'
        : 'password-help'}
    />
    <Helper id="password-help">8–128 characters</Helper>
    {#if fields.password}
      <Helper id="password-error" color="red" role="alert"
        >{fields.password.join('. ')}</Helper
      >
    {/if}
  </div>
  {#if error}<Alert color="red" role="alert">{error}</Alert>{/if}
  <Button
    type="submit"
    loading={pending}
    spinnerProps={{ size: '4', color: 'gray', 'aria-hidden': true }}
  >
    {pending ? 'Signing in…' : 'Sign in'}
  </Button>
</form>
