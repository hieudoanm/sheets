import { render } from '@testing-library/react';
import { Table } from '../Table';
import { INITIAL_CSV } from '@csv/constants/app';

describe('Table', () => {
  it('to match snapshot', () => {
    const { container } = render(<Table csv={INITIAL_CSV} />);
    expect(container).toMatchSnapshot();
  });
});
