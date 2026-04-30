<script lang="ts">
  import qrcode from 'qrcode';

  let { text, size = 256 }: { text: string; size?: number } = $props();

  let dataUrl = $state<string | null>(null);

  $effect(() => {
    let cancelled = false;
    dataUrl = null;
    qrcode
      .toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) dataUrl = url;
      })
      .catch(() => {
        if (!cancelled) dataUrl = null;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

{#if dataUrl}
  <img alt="QR code" src={dataUrl} width={size} height={size} />
{:else}
  <div class="qr-placeholder" style:width="{size}px" style:height="{size}px"></div>
{/if}

<style>
  img {
    display: block;
    background: #fff;
    border-radius: 4px;
  }
  .qr-placeholder {
    background: var(--bg-input, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
