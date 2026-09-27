const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';
const probe = params.get('probe');
const validId = /^synthetic-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const result = document.querySelector('#result');
if (result) {
  result.textContent = probe === 'synthetic' && validId
    ? 'Ovo je tačna test putanja za sintetičku poruku.'
    : 'Ovo nije tačna test putanja.';
}
