<script lang="ts">
  import { registrationSchema, type Registration } from '@chat/contracts/auth';
  import { ApiError } from '@shared/api';
  import { Alert, Button, Helper, Input, Label } from 'flowbite-svelte';
  let {
    onRegister,
  }: {
    onRegister: (input: Registration) => Promise<void>;
  } = $props();
  let email = $state('');
  let username = $state('');
  let password = $state('');
  let pending = $state(false);
  let error = $state('');
  let fields = $state<Record<string, string[]>>({});

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return;
    error = '';
    fields = {};
    const parsed = registrationSchema.safeParse({ email, username, password });
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
      await onRegister(parsed.data);
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
    <Label for="username" color={fields.username ? 'red' : 'gray'}
      >Username</Label
    >
    <Input
      class="text-base sm:text-sm"
      id="username"
      autocomplete="username"
      bind:value={username}
      color={fields.username ? 'red' : 'default'}
      disabled={pending}
      required
      aria-invalid={!!fields.username}
      aria-describedby={fields.username
        ? 'username-help username-error'
        : 'username-help'}
    />
    <Helper id="username-help">3–30 Latin letters, digits or underscores</Helper
    >
    {#if fields.username}
      <Helper id="username-error" color="red" role="alert"
        >{fields.username.join('. ')}</Helper
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
      autocomplete="new-password"
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
    {pending ? 'Creating account…' : 'Create account'}
  </Button>
</form>
