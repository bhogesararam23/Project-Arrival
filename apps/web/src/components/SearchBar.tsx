import type { FC } from 'react';

interface Props {
  query: string;
  country: string;
  onQueryChange: (q: string) => void;
  onCountryChange: (c: string) => void;
}

export const SearchBar: FC<Props> = ({ query, country, onQueryChange, onCountryChange }) => {
  return (
    <div className="search-container">
      <div className="search-input-wrapper">
        <input
          type="text"
          className="search-input"
          placeholder="Search by restaurant name, bakery, or cuisine..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      <select
        className="country-select"
        value={country}
        onChange={(e) => onCountryChange(e.target.value)}
        aria-label="Filter by Country"
      >
        <option value="">All Markets</option>
        <option value="GB">United Kingdom (GB - Pilot Active)</option>
        <option value="DE">Germany (DE - Browse Only)</option>
      </select>
    </div>
  );
};
