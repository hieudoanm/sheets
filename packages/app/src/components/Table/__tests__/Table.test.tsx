import { INITIAL_CSV } from '@sheets/constants/app';
import { render } from '@testing-library/react';
import { Table } from '../Table';

describe('Table', () => {
  it('to match snapshot', () => {
    const { container } = render(<Table csv={INITIAL_CSV} />);
    expect(container).toMatchSnapshot();
  });
});
