<script lang="ts">
  import { Button, Card, Heading, Helper, P } from 'flowbite-svelte';
  import { RegistrationForm } from '@features/register';
  import type { ApiClient } from '@shared/api';
  import type { CurrentUser } from '@chat/contracts';
  let {
    api,
    onRegistered,
    onSignIn,
  }: {
    api: ApiClient;
    onRegistered: (user: CurrentUser, expiresAt: number) => void;
    onSignIn: () => void;
  } = $props();
</script>

<main class="flex min-h-dvh items-center justify-center p-4 sm:p-8">
  <Card size="md" class="gap-6 p-6 sm:p-8">
    <header class="flex flex-col gap-2">
      <Helper>Chat</Helper>
      <Heading tag="h1" class="text-2xl">Create an account</Heading>
      <P size="sm">Create an account to start chatting.</P>
    </header>
    <RegistrationForm {api} {onRegistered} />
    <Button color="alternative" onclick={onSignIn}
      >Already have an account? Sign in</Button
    >
  </Card>
</main>
