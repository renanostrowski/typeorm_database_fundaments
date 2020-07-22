import { getRepository, In, getCustomRepository } from 'typeorm';
import csvParse from 'csv-parse';
import path from 'path';
import fs from 'fs';

import Transaction from '../models/Transaction';
import TransactionRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const csvPath = path.resolve(__dirname, '..', '..', 'tmp', filePath);

    const readCSVStream = fs.createReadStream(csvPath);

    const parseStream = csvParse({
      from_line: 2,
      ltrim: true,
      rtrim: true,
    });

    const parseCSV = readCSVStream.pipe(parseStream);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value || !category) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const categoriesRepository = getRepository(Category);

    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const categoriesTitle = existentCategories.map(item => item.title);

    const addCategory = categories
      .filter(category => !categoriesTitle.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategory = categoriesRepository.create(
      addCategory.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(newCategory);

    const finallyCategory = [...newCategory, ...existentCategories];

    const transactionsRepository = getCustomRepository(TransactionRepository);

    const createTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finallyCategory.find(
          category => category.title === transaction.title,
        ),
      })),
    );

    await transactionsRepository.save(createTransactions);

    fs.promises.unlink(csvPath);

    return createTransactions;
  }
}

export default ImportTransactionsService;
