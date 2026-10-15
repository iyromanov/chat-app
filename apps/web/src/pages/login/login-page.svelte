<script lang="ts">
  import type { CurrentUser } from '@chat/contracts';
  import type { ApiClient } from '@shared/api';
  import { LoginForm } from '@features/login';
  import { Button, Card, Heading, P } from 'flowbite-svelte';
  let {
    api,
    onLoggedIn,
    onRegister,
  }: {
    api: ApiClient;
    onLoggedIn: (user: CurrentUser, expiresAt: number) => void;
    onRegister: () => void;
  } = $props();
</script>

<main class="grid min-h-dvh place-items-center p-6">
  <Card size="md" class="w-full max-w-md gap-6 p-6">
    <Heading tag="h1" class="text-3xl">Sign in</Heading>
    <P>Welcome back to Chat.</P>
    <LoginForm {api} {onLoggedIn} />
    <Button color="alternative" onclick={onRegister}>Create an account</Button>
  </Card>
</main>
